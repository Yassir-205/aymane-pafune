alter table public.products add constraint product_description_length check (char_length(description)<=5000);
alter table public.delivery_cities add constraint delivery_option_length check (char_length(trim(option)) between 1 and 150);
alter table public.store_settings add constraint store_content_length check (
 char_length(trim(name)) between 1 and 200 and char_length(trim(headline)) between 1 and 1500
 and char_length(description)<=1500 and char_length(promotion)<=1500
 and char_length(contact)<=1500 and char_length(delivery)<=1500 and char_length(instagram)<=200
);
create function public.touch_updated_at() returns trigger language plpgsql set search_path='' as $$
begin new.updated_at=now(); return new; end $$;
do $$
declare t text;
begin
 foreach t in array array['products','product_variants','orders','delivery_cities','store_settings'] loop
  execute format('alter table public.%I add column updated_at timestamptz not null default now()', t);
  execute format('create trigger touch_updated_at before update on public.%I for each row execute function public.touch_updated_at()', t);
 end loop;
end $$;
do $$
begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') and not exists (
  select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='orders'
 ) then
  alter publication supabase_realtime add table public.orders;
 end if;
end $$;

