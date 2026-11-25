begin;

create table public.deleted_product_sales (
  id uuid primary key,
  name text not null,
  collections jsonb not null
);

alter table public.deleted_product_sales enable row level security;
revoke all on public.deleted_product_sales from public, anon, authenticated;

alter table public.product_variants
  alter column product_id drop not null,
  add column deleted_product_id uuid references public.deleted_product_sales(id),
  add constraint product_variants_catalog_or_history check (
    (product_id is not null and deleted_product_id is null)
    or (product_id is null and deleted_product_id is not null and not active)
  );

create index order_items_variant_id_idx on public.order_items(variant_id);

create or replace function public.delete_unused_product(p_id uuid)
returns text[] language plpgsql security definer set search_path = '' as $$
declare
  product_name text;
  retained_variants uuid[];
  image_paths text[];
begin
  if not public.is_admin() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;

  select p.name into product_name from public.products p where p.id = p_id for update;
  if not found then raise exception 'PRODUCT_NOT_FOUND'; end if;

  -- Match the checkout lock order and prevent concurrent references during deletion.
  perform v.id from public.product_variants v
  where v.product_id = p_id order by v.id for update;

  select array_agg(v.id) into retained_variants
  from public.product_variants v
  where v.product_id = p_id and (
    exists (select 1 from public.order_items i where i.variant_id = v.id)
    or exists (
      select 1 from public.inventory_movements m
      where m.variant_id = v.id and m.order_id is not null
    )
  );

  if retained_variants is not null then
    insert into public.deleted_product_sales(id, name, collections)
    select p_id, product_name, coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name)), '[]'::jsonb)
    from public.product_collections pc join public.collections c on c.id = pc.collection_id
    where pc.product_id = p_id;

    -- Keep original variant IDs for order lines, checkout retries and stock returns.
    update public.product_variants
    set product_id = null, deleted_product_id = p_id, active = false
    where id = any(retained_variants);
  end if;

  select coalesce(array_agg(path), array[]::text[]) into image_paths
  from public.product_images where product_id = p_id;

  delete from public.inventory_movements m using public.product_variants v
  where m.variant_id = v.id and v.product_id = p_id and m.order_id is null;

  delete from public.products where id = p_id;
  return image_paths;
exception when foreign_key_violation then
  raise exception 'PRODUCT_HAS_PROTECTED_DEPENDENCIES';
end $$;

revoke all on function public.delete_unused_product(uuid) from public, anon, authenticated;
grant execute on function public.delete_unused_product(uuid) to authenticated;


create or replace function public.admin_dashboard_statistics(p_from date default null, p_to date default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  from_time timestamptz := p_from::timestamp at time zone 'Africa/Casablanca';
  until_time timestamptz := (p_to + 1)::timestamp at time zone 'Africa/Casablanca';
  result jsonb;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if p_from > p_to then raise exception 'INVALID_DATE_RANGE' using errcode = '22023'; end if;

  with active_products as (
    select id from public.products where archived_at is null
  ), inventory as (
    select count(*) as variants, coalesce(sum(v.stock), 0) as units,
           count(*) filter (where v.stock between 1 and 3) as low_stock,
           count(*) filter (where v.stock = 0) as out_of_stock
    from public.product_variants v join active_products p on p.id = v.product_id
    where v.active
  ), period_orders as (
    select id, reference, status, total, created_at from public.orders
    where (from_time is null or created_at >= from_time)
      and (until_time is null or created_at < until_time)
  ), delivered_orders as (
    select o.id, o.total, coalesce(h.delivered_at, o.created_at) as delivered_at
    from public.orders o
    cross join lateral (
      select max(created_at) as delivered_at from public.order_status_history
      where order_id = o.id and status = 'delivered'
    ) h
    where o.status = 'delivered'
  ), period_deliveries as (
    select id, total, (delivered_at at time zone 'Africa/Casablanca')::date as date
    from delivered_orders
    where (from_time is null or delivered_at >= from_time)
      and (until_time is null or delivered_at < until_time)
  ), sales as (
    select date, sum(total) as amount from period_deliveries group by date
  ), items as (
    select coalesce(v.product_id, v.deleted_product_id) as product_id, i.quantity, i.quantity * i.unit_price as amount
    from period_deliveries d
    join public.order_items i on i.order_id = d.id
    join public.product_variants v on v.id = i.variant_id
  ), product_sales as (
    select i.product_id as id, coalesce(p.name, h.name) as name,
           p.id is null or p.archived_at is not null as archived, p.id is null as deleted,
           sum(i.quantity) as units, sum(i.amount) as amount
    from items i
    left join public.products p on p.id = i.product_id
    left join public.deleted_product_sales h on h.id = i.product_id
    group by i.product_id, p.id, h.id
  ), collection_shares as (
    -- Use current memberships for catalog products and the deletion snapshot for history.
    select p.amount * 100 as cents, membership.id, coalesce(c.name, membership.saved_name) as name,
           count(*) over (partition by p.id) as memberships,
           row_number() over (partition by p.id order by membership.id) as position
    from product_sales p
    left join public.deleted_product_sales h on h.id = p.id and p.deleted
    left join lateral (
      select pc.collection_id as id, null::text as saved_name
      from public.product_collections pc where pc.product_id = p.id and not p.deleted
      union all
      select saved.id, saved.name
      from jsonb_to_recordset(h.collections) as saved(id uuid, name text)
    ) membership on true
    left join public.collections c on c.id = membership.id
  ), collection_sales as (
    select id, max(name) as name, sum(div(cents, memberships) +
           case when position <= mod(cents, memberships) then 1 else 0 end) / 100 as amount
    from collection_shares
    group by id
  )

  select jsonb_build_object(
    'products', (select count(*) from active_products),
    'collections', (select count(*) from public.collections),
    'brands', (select count(*) from public.brands),
    'inventory', (select to_jsonb(inventory) from inventory),
    'orders', (select count(*) from period_orders),
    'statuses', coalesce((select jsonb_object_agg(status, quantity) from (
      select status, count(*) as quantity from period_orders group by status
    ) counts), '{}'::jsonb),
    'revenue', (select coalesce(sum(amount), 0) from sales),
    'sales', coalesce((select jsonb_agg(to_jsonb(sales) order by date) from sales), '[]'::jsonb),
    'best_sellers', coalesce((select jsonb_agg(to_jsonb(ranked) order by units desc, amount desc, id) from (
      select * from product_sales order by units desc, amount desc, id limit 5
    ) ranked), '[]'::jsonb),
    'collection_sales', coalesce((select jsonb_agg(to_jsonb(collection_sales) order by amount desc, name, id) from collection_sales), '[]'::jsonb),
    'recent', coalesce((select jsonb_agg(to_jsonb(recent) order by created_at desc, id desc) from (
      select * from period_orders order by created_at desc, id desc limit 5
    ) recent), '[]'::jsonb)
  ) into result;
  return result;
end $$;

revoke all on function public.admin_dashboard_statistics(date, date) from public, anon, authenticated;
grant execute on function public.admin_dashboard_statistics(date, date) to authenticated;

commit;
