begin;

create function public.admin_catalog_statistics()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  result jsonb;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;

  with product_counts as (
    select
      count(*) filter (where published and archived_at is null) as published,
      count(*) filter (where not published and archived_at is null) as draft,
      count(*) filter (where archived_at is not null) as archived
    from public.products
  ), available_inventory as (
    select count(*) as variants, coalesce(sum(v.stock), 0) as units,
           count(*) filter (where v.stock between 1 and 3) as low_stock,
           count(*) filter (where v.stock = 0) as out_of_stock
    from public.product_variants v
    join public.products p on p.id = v.product_id
    where v.active and p.published and p.archived_at is null
  )
  select jsonb_build_object(
    'products', (select to_jsonb(product_counts) from product_counts),
    'inventory', (select to_jsonb(available_inventory) from available_inventory),
    'collections', (select count(*) from public.collections),
    'brands', (select count(*) from public.brands)
  ) into result;
  return result;
end $$;

revoke all on function public.admin_catalog_statistics() from public, anon, authenticated;
grant execute on function public.admin_catalog_statistics() to authenticated;

commit;
