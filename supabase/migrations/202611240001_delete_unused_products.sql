create function public.delete_unused_product(p_id uuid)
returns text[] language plpgsql security definer set search_path = '' as $$
declare
  is_published boolean;
  image_paths text[];
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;

  select published into is_published
  from public.products where id = p_id for update;
  if not found then raise exception 'PRODUCT_NOT_FOUND'; end if;
  if is_published then raise exception 'PRODUCT_IS_PUBLISHED'; end if;

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
  -- Keep the product and its history if an inventory change raced with deletion.
  raise exception 'PRODUCT_HAS_HISTORY';
end $$;

revoke all on function public.delete_unused_product(uuid) from public, anon, authenticated;
grant execute on function public.delete_unused_product(uuid) to authenticated;

