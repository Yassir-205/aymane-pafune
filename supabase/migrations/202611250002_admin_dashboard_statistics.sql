begin;

create function public.admin_dashboard_statistics(p_from date default null, p_to date default null)
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
           count(*) filter (where v.stock <= 3) as low_stock
    from public.product_variants v join active_products p on p.id = v.product_id
    where v.active
  ), period_orders as (
    select id, reference, status, total, created_at from public.orders
    where (from_time is null or created_at >= from_time)
      and (until_time is null or created_at < until_time)
  ), delivered_orders as (
    select o.total, coalesce(h.delivered_at, o.created_at) as delivered_at
    from public.orders o
    cross join lateral (
      select max(created_at) as delivered_at from public.order_status_history
      where order_id = o.id and status = 'delivered'
    ) h
    where o.status = 'delivered'
  ), sales as (
    select (delivered_at at time zone 'Africa/Casablanca')::date as date,
           sum(total) as amount
    from delivered_orders
    where (from_time is null or delivered_at >= from_time)
      and (until_time is null or delivered_at < until_time)
    group by 1
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
    'recent', coalesce((select jsonb_agg(to_jsonb(recent) order by created_at desc, id desc) from (
      select * from period_orders order by created_at desc, id desc limit 5
    ) recent), '[]'::jsonb)
  ) into result;
  return result;
end $$;

revoke all on function public.admin_dashboard_statistics(date, date) from public, anon, authenticated;
grant execute on function public.admin_dashboard_statistics(date, date) to authenticated;

commit;
