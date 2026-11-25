begin;

create or replace function public.delete_unused_product(p_id uuid)
returns text[] language plpgsql security definer set search_path = '' as $$
declare
  image_paths text[];
begin
  if not public.is_admin() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;

  perform 1 from public.products where id = p_id for update;
  if not found then raise exception 'PRODUCT_NOT_FOUND'; end if;

  -- Use the checkout lock order and block new foreign-key references during deletion.
  perform v.id from public.product_variants v
  where v.product_id = p_id order by v.id for update;

  if exists (
    select 1 from public.product_variants v
    where v.product_id = p_id and (
      exists (select 1 from public.order_items i where i.variant_id = v.id)
      or exists (
        select 1 from public.inventory_movements m
        where m.variant_id = v.id and m.order_id is not null
      )
    )
  ) then raise exception 'PRODUCT_HAS_ORDER_HISTORY'; end if;

  select coalesce(array_agg(path), array[]::text[]) into image_paths
  from public.product_images where product_id = p_id;

  delete from public.inventory_movements m using public.product_variants v
  where m.variant_id = v.id and v.product_id = p_id and m.order_id is null;

  -- The existing cascade removes variants, image records and collection assignments.
  delete from public.products where id = p_id;
  return image_paths;
exception when foreign_key_violation then
  raise exception 'PRODUCT_HAS_PROTECTED_DEPENDENCIES';
end $$;

revoke all on function public.delete_unused_product(uuid) from public, anon, authenticated;
grant execute on function public.delete_unused_product(uuid) to authenticated;

commit;
