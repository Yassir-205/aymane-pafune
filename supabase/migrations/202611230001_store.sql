create table public.profiles (
 id uuid primary key references auth.users on delete cascade,
 role text not null check (role = 'admin'),
 created_at timestamptz not null default now()
);
create function public.is_admin() returns boolean language sql stable security definer set search_path = ''
as $$ select exists(select 1 from public.profiles where id = (select auth.uid()) and role = 'admin') $$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;
create table public.brands (
 id uuid primary key default gen_random_uuid(),
 name text not null unique check (char_length(trim(name)) between 1 and 100)
);
create table public.categories (like public.brands including all);
insert into public.categories(name) values ('Homme'),('Femme'),('Unisexe');
create table public.products (
 id uuid primary key default gen_random_uuid(),
 brand_id uuid not null references public.brands,
 category_id uuid not null references public.categories,
 name text not null check (char_length(trim(name)) between 1 and 150),
 description text not null default '',
 published boolean not null default false,
 featured boolean not null default false,
 bestseller boolean not null default false,
 created_at timestamptz not null default now()
);
create table public.product_images (
 id uuid primary key default gen_random_uuid(),
 product_id uuid not null references public.products on delete cascade,
 path text not null unique,
 position integer not null default 0
);
create table public.product_variants (
 id uuid primary key default gen_random_uuid(),
 product_id uuid not null references public.products on delete cascade,
 size_ml integer not null check (size_ml between 1 and 5000),
 price numeric(10,2) not null check (price > 0 and price < 1000000),
 sale_price numeric(10,2) check (sale_price > 0 and sale_price < price),
 stock integer not null default 0 check (stock between 0 and 100000),
 active boolean not null default true,
 unique(product_id,size_ml)
);
create table public.delivery_cities (
 id uuid primary key default gen_random_uuid(),
 name text not null unique check (char_length(trim(name)) between 1 and 100),
 fee numeric(10,2) not null check (fee between 0 and 10000),
 enabled boolean not null default true,
 option text not null default 'Livraison à domicile'
);
create table public.store_settings (
 id integer primary key check (id=1),
 name text not null default 'Maison Ambre',
 headline text not null default E'Le parfum est\nun art.',
 description text not null default 'Une sélection de parfums de prestige, choisis pour leur authenticité. Livrés partout au Maroc.',
 promotion text not null default '',
 instagram text not null default '' check (instagram = '' or instagram ~ '^https://(www\.)?instagram\.com/[A-Za-z0-9._/?=&%-]+$'),
 whatsapp text not null default '' check (whatsapp = '' or whatsapp ~ '^212[5-7][0-9]{8}$'),
 contact text not null default '',
 logo text not null default '',
 banner text not null default '',
 delivery text not null default 'Paiement à la livraison'
);
insert into public.store_settings(id) values (1);
create type public.order_status as enum ('pending','confirmed','preparing','shipped','delivered','cancelled');
create table public.orders (
 id uuid primary key default gen_random_uuid(),
 reference text not null unique default ('MA-' || upper(replace(gen_random_uuid()::text,'-',''))),
 request_key uuid not null unique,
 request_hash text not null,
 customer_name text not null check (char_length(customer_name) between 2 and 100),
 phone text not null check (phone ~ '^0[5-7][0-9]{8}$'),
 city_id uuid not null references public.delivery_cities,
 city_name text not null,
 address text not null check (char_length(address) between 8 and 300),
 notes text not null default '' check (char_length(notes) <= 500),
 internal_note text not null default '',
 subtotal numeric(14,2) not null check (subtotal > 0),
 delivery_fee numeric(10,2) not null check (delivery_fee >= 0),
 total numeric(14,2) generated always as (subtotal + delivery_fee) stored,
 status public.order_status not null default 'pending',
 created_at timestamptz not null default now()
);
create table public.order_items (
 order_id uuid not null references public.orders,
 variant_id uuid not null references public.product_variants,
 product_name text not null,
 size_ml integer not null,
 quantity integer not null check (quantity between 1 and 20),
 unit_price numeric(10,2) not null check (unit_price > 0),
 primary key(order_id,variant_id)
);
create table public.inventory_movements (
 id bigint generated always as identity primary key,
 variant_id uuid not null references public.product_variants,
 order_id uuid references public.orders,
 quantity integer not null check (quantity <> 0),
 reason text not null check (reason in ('initial','adjustment','reservation','cancellation')),
 actor_id uuid references auth.users on delete set null,
 created_at timestamptz not null default now()
);
create table public.order_status_history (
 id bigint generated always as identity primary key,
 order_id uuid not null references public.orders,
 status public.order_status not null,
 actor_id uuid references auth.users on delete set null,
 created_at timestamptz not null default now()
);
create table public.checkout_limits (
 identifier text primary key,
 window_start timestamptz not null,
 attempts integer not null
);
create index on public.products(published,created_at desc);
create index on public.products(brand_id);
create index on public.products(category_id);
create index on public.product_images(product_id,position);
create index on public.orders(status,created_at desc);
create index on public.orders(created_at desc);
create index on public.inventory_movements(variant_id,created_at desc);
create index on public.order_status_history(order_id,created_at);
create index on public.checkout_limits(window_start);

do $$
declare t text;
begin
 foreach t in array array['profiles','brands','categories','products','product_images','product_variants','delivery_cities','store_settings','orders','order_items','inventory_movements','order_status_history','checkout_limits'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from anon, authenticated, public',t);
 end loop;
 foreach t in array array['brands','categories','products','product_images','product_variants','delivery_cities','store_settings'] loop
  execute format('grant select on public.%I to anon, authenticated',t);
  execute format('grant insert,update,delete on public.%I to authenticated',t);
  execute format('create policy admin_write on public.%I for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()))',t);
 end loop;
 foreach t in array array['orders','order_items','inventory_movements','order_status_history'] loop
  execute format('grant select on public.%I to authenticated',t);
  execute format('create policy admin_read on public.%I for select to authenticated using ((select public.is_admin()))',t);
 end loop;
end $$;
revoke delete on public.product_variants,public.products,public.store_settings from authenticated;
create policy public_brands on public.brands for select to anon,authenticated using (true);
create policy public_categories on public.categories for select to anon,authenticated using (true);
create policy public_products on public.products for select to anon,authenticated using (published);
create policy public_variants on public.product_variants for select to anon,authenticated using (active and exists(select 1 from public.products p where p.id = product_id and p.published));
create policy public_images on public.product_images for select to anon,authenticated using (exists(select 1 from public.products p where p.id = product_id and p.published));
create policy public_cities on public.delivery_cities for select to anon,authenticated using (enabled);
create policy public_settings on public.store_settings for select to anon,authenticated using (true);
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('store-media','store-media',true,5242880,array['image/jpeg','image/png','image/webp','image/avif']);
create policy admin_media on storage.objects for all to authenticated
using (bucket_id = 'store-media' and (select public.is_admin()))
with check (bucket_id = 'store-media' and (select public.is_admin()));

create function public.log_stock() returns trigger language plpgsql security definer set search_path = '' as $$
declare previous integer := 0;
declare movement_reason text := 'initial';
declare movement_order uuid := nullif(current_setting('store.order_id',true),'')::uuid;
begin
 if tg_op = 'UPDATE' then
   previous := old.stock;
   movement_reason := coalesce(nullif(current_setting('store.reason',true),''),'adjustment');
 end if;
 if new.stock <> previous then
   insert into public.inventory_movements(variant_id,order_id,quantity,reason,actor_id)
   values (new.id,movement_order,new.stock-previous,movement_reason,auth.uid());
 end if;
 return new;
end $$;
revoke all on function public.log_stock() from public;
create trigger log_stock after insert or update of stock on public.product_variants for each row execute function public.log_stock();

create function public.consume_checkout_limit(p_identifier text) returns boolean language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
 insert into public.checkout_limits as l values (p_identifier,now(),1)
 on conflict(identifier) do update set
  window_start=case when l.window_start < now()-interval '10 minutes' then now() else l.window_start end,
  attempts=case when l.window_start < now()-interval '10 minutes' then 1 else least(l.attempts+1,30) end
 returning attempts into n;
 return n <= 12;
end $$;
revoke all on function public.consume_checkout_limit(text) from public, anon, authenticated;
grant execute on function public.consume_checkout_limit(text) to service_role;

create function public.create_checkout(p_key uuid,p_hash text,p_name text,p_phone text,p_city uuid,p_address text,p_notes text,p_items jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare o public.orders;
declare c public.delivery_cities;
declare item record;
declare subtotal_amount numeric := 0;
declare snapshot jsonb := '[]'::jsonb;
declare expected integer := jsonb_array_length(p_items);
begin
 perform pg_advisory_xact_lock(hashtextextended(p_key::text,0));
 select * into o from public.orders where request_key=p_key;
 if found then
   if o.request_hash <> p_hash then raise exception 'KEY_CONFLICT'; end if;
 else
   if expected is null or expected not between 1 and 20 then raise exception 'INVALID_ITEMS'; end if;
   select * into c from public.delivery_cities where id=p_city and enabled for share;
   if not found then raise exception 'INVALID_CITY'; end if;
   perform p.id from public.products p where p.id in (
     select v.product_id from jsonb_to_recordset(p_items) as i("variantId" uuid)
     join public.product_variants v on v.id=i."variantId"
   ) order by p.id for share;
   for item in
     select v.id as variant_id,v.stock,v.size_ml,coalesce(v.sale_price,v.price) as unit_price,p.name as product_name,i.quantity
     from jsonb_to_recordset(p_items) as i("variantId" uuid,quantity int)
     join public.product_variants v on v.id=i."variantId"
     join public.products p on p.id=v.product_id
     where v.active and p.published
     order by v.id for update of v
   loop
     if item.quantity is null or item.quantity not between 1 and 20 or item.quantity>item.stock
       or snapshot @> jsonb_build_array(jsonb_build_object('variant_id',item.variant_id))
     then raise exception 'INVALID_STOCK'; end if;
     subtotal_amount := subtotal_amount + item.quantity*item.unit_price;
     snapshot := snapshot || (to_jsonb(item)-'stock');
   end loop;
   if jsonb_array_length(snapshot)<>expected then raise exception 'INVALID_STOCK'; end if;
   insert into public.orders(request_key,request_hash,customer_name,phone,city_id,city_name,address,notes,subtotal,delivery_fee)
   values (p_key,p_hash,p_name,p_phone,c.id,c.name,p_address,p_notes,subtotal_amount,c.fee) returning * into o;
   insert into public.order_items select o.id,i.variant_id,i.product_name,i.size_ml,i.quantity,i.unit_price
   from jsonb_to_recordset(snapshot) as i(variant_id uuid,product_name text,size_ml int,quantity int,unit_price numeric);
   perform set_config('store.order_id',o.id::text,true);
   perform set_config('store.reason','reservation',true);
   update public.product_variants v set stock=v.stock-i.quantity
   from public.order_items i where i.order_id=o.id and i.variant_id=v.id;
   insert into public.order_status_history(order_id,status) values(o.id,'pending');
 end if;
 return jsonb_build_object('reference',o.reference,'total',o.total,'subtotal',o.subtotal,'delivery_fee',o.delivery_fee,
   'customer_name',o.customer_name,'city_name',o.city_name,'address',o.address,'items',
   (select jsonb_agg(to_jsonb(i)-'order_id' order by i.variant_id) from public.order_items i where i.order_id=o.id));
end $$;
revoke all on function public.create_checkout(uuid,text,text,text,uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.create_checkout(uuid,text,text,text,uuid,text,text,jsonb) to service_role;

create function public.manage_order(p_id uuid,p_status public.order_status,p_note text)
returns void language plpgsql security definer set search_path = '' as $$
declare previous public.order_status;
begin
 if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
 if p_note is null or char_length(p_note)>2000 then raise exception 'INVALID_NOTE'; end if;
 select status into previous from public.orders where id=p_id for update;
 if not found then raise exception 'NOT_FOUND'; end if;
 if previous <> p_status then
   if previous in ('cancelled','delivered') or not (
     p_status = 'cancelled' or
     (previous='pending' and p_status='confirmed') or
     (previous='confirmed' and p_status='preparing') or
     (previous='preparing' and p_status='shipped') or
     (previous='shipped' and p_status='delivered')
   ) then raise exception 'INVALID_STATUS'; end if;
   if p_status='cancelled' then
     perform v.id from public.product_variants v join public.order_items i on i.variant_id=v.id where i.order_id=p_id order by v.id for update of v;
     perform set_config('store.order_id',p_id::text,true);
     perform set_config('store.reason','cancellation',true);
     update public.product_variants v set stock=v.stock+i.quantity
     from public.order_items i where i.order_id=p_id and i.variant_id=v.id;
   end if;
   insert into public.order_status_history(order_id,status,actor_id) values(p_id,p_status,auth.uid());
 end if;
 update public.orders set status=p_status,internal_note=p_note where id=p_id;
end $$;
revoke all on function public.manage_order(uuid,public.order_status,text) from public,anon;
grant execute on function public.manage_order(uuid,public.order_status,text) to authenticated;

