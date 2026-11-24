create function public.save_product(p_id uuid,p_product jsonb,p_variants jsonb,p_images jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare product_id_value uuid := coalesce(p_id,gen_random_uuid());
begin
 if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
 if jsonb_array_length(p_variants)>30 or jsonb_array_length(p_images)>12 then raise exception 'TOO_MANY_ROWS'; end if;
 if p_id is null then
   insert into public.products(id,name,description,brand_id,category_id,published,featured,bestseller)
   select product_id_value,p.name,p.description,p.brand_id,p.category_id,p.published,p.featured,p.bestseller
   from jsonb_to_record(p_product) as p(name text,description text,brand_id uuid,category_id uuid,published boolean,featured boolean,bestseller boolean);
 else
   update public.products target set name=p.name,description=p.description,brand_id=p.brand_id,category_id=p.category_id,
   published=p.published,featured=p.featured,bestseller=p.bestseller
   from jsonb_to_record(p_product) as p(name text,description text,brand_id uuid,category_id uuid,published boolean,featured boolean,bestseller boolean)
   where target.id=product_id_value;
   if not found then raise exception 'NOT_FOUND'; end if;
 end if;
 insert into public.product_variants(product_id,size_ml,price,sale_price,stock,active)
 select product_id_value,v.size_ml,v.price,v.sale_price,v.stock,true
 from jsonb_to_recordset(p_variants) as v(size_ml int,price numeric,sale_price numeric,stock int)
 order by v.size_ml
 on conflict(product_id,size_ml) do update set price=excluded.price,sale_price=excluded.sale_price,active=true;
 update public.product_variants v set active=false
 where v.product_id=product_id_value and v.active and not exists (
  select 1 from jsonb_to_recordset(p_variants) as i(size_ml integer) where i.size_ml=v.size_ml
 );
 delete from public.product_images i where i.product_id=product_id_value
 and not exists(select 1 from jsonb_array_elements_text(p_images) as image(path) where image.path=i.path);
 insert into public.product_images(product_id,path,position)
 select product_id_value,p.path,p.position-1 from jsonb_array_elements_text(p_images) with ordinality p(path,position)
 on conflict(path) do update set position=excluded.position where public.product_images.product_id=product_id_value;
 return product_id_value;
end $$;
revoke all on function public.save_product(uuid,jsonb,jsonb,jsonb) from public,anon;
grant execute on function public.save_product(uuid,jsonb,jsonb,jsonb) to authenticated;

create function public.adjust_stock(p_id uuid,p_delta integer)
returns integer language plpgsql security definer set search_path='' as $$
declare new_stock integer;
begin
 if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
 if p_delta is null or p_delta=0 or p_delta not between -100000 and 100000 then raise exception 'INVALID_ADJUSTMENT'; end if;
 update public.product_variants set stock=stock+p_delta where id=p_id returning stock into new_stock;
 if not found then raise exception 'NOT_FOUND'; end if;
 return new_stock;
end $$;
revoke all on function public.adjust_stock(uuid,integer) from public,anon;
grant execute on function public.adjust_stock(uuid,integer) to authenticated;

