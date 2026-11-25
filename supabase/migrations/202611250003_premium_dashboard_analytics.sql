begin;

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
    select v.product_id, i.quantity, i.quantity * i.unit_price as amount
    from period_deliveries d
    join public.order_items i on i.order_id = d.id
    join public.product_variants v on v.id = i.variant_id
  ), product_sales as (
    select p.id, p.name, p.archived_at is not null as archived,
           sum(i.quantity) as units, sum(i.amount) as amount
    from items i join public.products p on p.id = i.product_id
    group by p.id
  ), collection_shares as (
    -- Allocate merchandise revenue in whole cents across current memberships.
    select p.amount * 100 as cents, c.id, c.name,
           count(*) over (partition by p.id) as memberships,
           row_number() over (partition by p.id order by c.id) as position
    from product_sales p
    left join public.product_collections pc on pc.product_id = p.id
    left join public.collections c on c.id = pc.collection_id
  ), collection_sales as (
    select id, name, sum(div(cents, memberships) +
           case when position <= mod(cents, memberships) then 1 else 0 end) / 100 as amount
    from collection_shares
    group by id, name
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
