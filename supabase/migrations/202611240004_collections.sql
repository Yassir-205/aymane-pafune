create table if not exists public.collections (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 150),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  image_path text unique,
  published boolean not null default false,
  sort_order bigint not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now()
);
create table if not exists public.product_collections (
  product_id uuid not null references public.products(id) on delete cascade,
  collection_id uuid not null references public.collections(id) on delete cascade,
  primary key (product_id, collection_id)
);
create index if not exists collections_display_order on public.collections(sort_order, created_at, id);
create index if not exists product_collections_collection_product on public.product_collections(collection_id, product_id);

alter table public.collections enable row level security;
alter table public.product_collections enable row level security;
revoke all on public.collections, public.product_collections from public, anon, authenticated;
grant select on public.collections, public.product_collections to anon, authenticated;
grant insert, update, delete on public.collections, public.product_collections to authenticated;

drop policy if exists public_collections_read on public.collections;
create policy public_collections_read on public.collections for select to anon, authenticated using (published);
drop policy if exists admin_collections_write on public.collections;
create policy admin_collections_write on public.collections for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
drop policy if exists public_product_collections_read on public.product_collections;
create policy public_product_collections_read on public.product_collections for select to anon, authenticated
  using (
    exists (select 1 from public.collections c where c.id = collection_id and c.published)
    and exists (select 1 from public.products p where p.id = product_id and p.published)
  );
drop policy if exists admin_product_collections_write on public.product_collections;
create policy admin_product_collections_write on public.product_collections for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('collection-media', 'collection-media', false, 5242880, array['image/webp', 'image/png'])
on conflict (id) do nothing;

drop policy if exists published_collection_media on storage.objects;
create policy published_collection_media on storage.objects for select to anon, authenticated
  using (bucket_id = 'collection-media' and exists (
    select 1 from public.collections c where c.image_path = storage.objects.name and c.published
  ));
drop policy if exists admin_collection_media on storage.objects;
create policy admin_collection_media on storage.objects for all to authenticated
  using (bucket_id = 'collection-media' and (select public.is_admin()))
  with check (bucket_id = 'collection-media' and (select public.is_admin()));

-- Bootstrap the existing storefront links once. Only newly inserted collections receive memberships.
with seed(name, slug, category_name, position, discounts_only) as (
  values ('Parfums Femme', 'femme', 'Femme', 1, false),
         ('Parfums Homme', 'homme', 'Homme', 2, false),
         ('Parfums Unisexe', 'unisexe', 'Unisexe', 3, false),
         ('Promotions Femme', 'promotions-femme', 'Femme', 4, true)
), inserted as (
  insert into public.collections (name, slug, published, sort_order)
  select s.name, s.slug, true, s.position
  from seed s
  where not s.discounts_only or exists (
    select 1 from public.products p
    join public.categories c on c.id = p.category_id
    join public.product_variants v on v.product_id = p.id
    where p.published and c.name = s.category_name and v.active and v.sale_price < v.price
  )
  on conflict (slug) do nothing
  returning id, slug
)
insert into public.product_collections (product_id, collection_id)
select p.id, i.id
from inserted i
join seed s on s.slug = i.slug
join public.categories c on c.name = s.category_name
join public.products p on p.category_id = c.id
where not s.discounts_only or exists (
  select 1 from public.product_variants v where v.product_id = p.id and v.active and v.sale_price < v.price
)
on conflict do nothing;

-- Keep collection assignments atomic with the existing product and stock write.
create or replace function public.save_product_with_collections(
  p_id uuid, p_product jsonb, p_variants jsonb, p_images jsonb, p_stock_changes jsonb, p_collection_ids uuid[]
) returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  saved_id uuid;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if coalesce(jsonb_array_length(p_stock_changes), 0) > 0 then
    saved_id := public.save_product_with_stock(p_id, p_product, p_variants, p_images, p_stock_changes);
  else
    saved_id := public.save_product(p_id, p_product, p_variants, p_images);
  end if;

  -- Null leaves assignments untouched when the editor does not change them.
  if p_collection_ids is not null then
    delete from public.product_collections
    where product_id = saved_id and collection_id <> all(p_collection_ids);
    insert into public.product_collections (product_id, collection_id)
    select saved_id, id from unnest(p_collection_ids) as chosen(id)
    on conflict do nothing;
  end if;
  return saved_id;
end $$;
revoke all on function public.save_product_with_collections(uuid,jsonb,jsonb,jsonb,jsonb,uuid[]) from public, anon;
grant execute on function public.save_product_with_collections(uuid,jsonb,jsonb,jsonb,jsonb,uuid[]) to authenticated;

create or replace function public.move_collection(p_id uuid, p_neighbor_id uuid, p_direction integer)
returns void language plpgsql security invoker set search_path = '' as $$
declare ids uuid[]; current_position integer; next_position integer;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if p_direction is null or p_direction not in (-1, 1) then raise exception 'INVALID_DIRECTION'; end if;
  lock table public.collections in share row exclusive mode;
  select array_agg(id order by sort_order, created_at, id) into ids from public.collections;
  current_position := array_position(ids, p_id);
  next_position := current_position + p_direction;
  if current_position is null or p_neighbor_id is null or ids[next_position] is distinct from p_neighbor_id then
    raise exception 'COLLECTION_ORDER_CHANGED';
  end if;
  ids[current_position] := p_neighbor_id;
  ids[next_position] := p_id;
  update public.collections c set sort_order = ranked.position
  from unnest(ids) with ordinality as ranked(id, position)
  where c.id = ranked.id and c.sort_order <> ranked.position;
end $$;
revoke all on function public.move_collection(uuid,uuid,integer) from public, anon;
grant execute on function public.move_collection(uuid,uuid,integer) to authenticated;
