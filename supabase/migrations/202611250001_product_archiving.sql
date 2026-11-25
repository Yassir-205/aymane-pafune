begin;

alter table public.products
  add column archived_at timestamptz,
  add constraint products_archive_unpublished check (archived_at is null or not published);

create function public.set_product_archived(p_id uuid, p_archived boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  if p_archived is null then raise exception 'INVALID_ARCHIVE_STATUS'; end if;

  update public.products
  set archived_at = case when p_archived then coalesce(archived_at, now()) else null end,
      published = case when p_archived then false else published end
  where id = p_id;
  if not found then raise exception 'PRODUCT_NOT_FOUND'; end if;
end $$;

revoke all on function public.set_product_archived(uuid, boolean) from public, anon, authenticated;
grant execute on function public.set_product_archived(uuid, boolean) to authenticated;

create or replace function public.delete_unused_product(p_id uuid)
returns text[] language plpgsql security definer set search_path = '' as $$
declare
  image_paths text[];
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;

  perform 1 from public.products where id = p_id for update;
  if not found then raise exception 'PRODUCT_NOT_FOUND'; end if;

  if exists (
    select 1 from public.product_variants v
    where v.product_id = p_id and (
      exists (select 1 from public.order_items i where i.variant_id = v.id)
      or exists (select 1 from public.inventory_movements m where m.variant_id = v.id)
    )
  ) then raise exception 'PRODUCT_HAS_HISTORY'; end if;

  select coalesce(array_agg(path), array[]::text[]) into image_paths
  from public.product_images where product_id = p_id;

  delete from public.products where id = p_id;
  return image_paths;
exception when foreign_key_violation then
  raise exception 'PRODUCT_HAS_HISTORY';
end $$;

commit;
