-- Save product fields and stock adjustments in one transaction.
create function public.save_product_with_stock(p_id uuid,p_product jsonb,p_variants jsonb,p_images jsonb,p_stock_changes jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare
  product_id_value uuid;
  change record;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  if p_id is null or coalesce(jsonb_array_length(p_stock_changes),0) not between 1 and 30 then
    raise exception 'INVALID_STOCK_CHANGES';
  end if;

  product_id_value := public.save_product(p_id,p_product,p_variants,p_images);
  for change in
    select * from jsonb_to_recordset(p_stock_changes) as item(size_ml integer,expected integer,quantity integer)
    order by size_ml
  loop
    if change.expected is null or change.quantity is null or change.quantity not between 0 and 100000 then
      raise exception 'INVALID_STOCK_CHANGES';
    end if;
    update public.product_variants
       set stock = change.quantity
     where product_id=product_id_value and size_ml=change.size_ml and active and stock=change.expected;
    if not found then raise exception 'STOCK_CHANGED'; end if;
  end loop;
  return product_id_value;
end $$;

revoke all on function public.save_product_with_stock(uuid,jsonb,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.save_product_with_stock(uuid,jsonb,jsonb,jsonb,jsonb) to authenticated;

