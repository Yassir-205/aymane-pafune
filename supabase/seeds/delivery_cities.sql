-- Optional data seed. Replace null only with your confirmed delivery fee in MAD.
-- Confirmed rates are published when activate_new_cities is true.
-- Set it to false to review new cities in /admin/delivery before enabling them.
-- Existing names, fees, delivery options and enabled states are preserved.
do $$
declare
  rates jsonb := '{
    "Fès": null,
    "Casablanca": null,
    "Rabat": null,
    "Marrakech": null,
    "Tanger": null,
    "Meknès": null,
    "Agadir": null,
    "Oujda": null,
    "Tétouan": null,
    "Kénitra": null,
    "Salé": null,
    "Témara": null,
    "Mohammédia": null,
    "El Jadida": null,
    "Safi": null,
    "Béni Mellal": null,
    "Nador": null,
    "Khouribga": null,
    "Taza": null,
    "Settat": null,
    "Essaouira": null,
    "Ouarzazate": null
  }'::jsonb;
  activate_new_cities boolean := true;
  city record;
  fee_amount numeric;
  normalized_name text;
  inserted_count integer := 0;
  affected_rows integer;
begin
  lock table public.delivery_cities in share row exclusive mode;

  for city in select key as name, value as rate from jsonb_each(rates) where value <> 'null'::jsonb
  loop
    if jsonb_typeof(city.rate) <> 'number' then
      raise exception 'Le tarif de % doit être un nombre en MAD.', city.name;
    end if;
    fee_amount := (city.rate::text)::numeric;
    if fee_amount < 0 or fee_amount > 10000 or fee_amount <> round(fee_amount, 2) then
      raise exception 'Tarif non valide pour %. Utilisez un montant entre 0 et 10000 MAD avec deux décimales au maximum.', city.name;
    end if;

    normalized_name := translate(lower(trim(city.name)), 'àâäéèêëîïôöùûüç', 'aaaeeeeiioouuuc');
    insert into public.delivery_cities (name, fee, enabled)
    select city.name, fee_amount, activate_new_cities
    where not exists (
      select 1
      from public.delivery_cities existing
      where translate(lower(trim(existing.name)), 'àâäéèêëîïôöùûüç', 'aaaeeeeiioouuuc') = normalized_name
    )
    on conflict (name) do nothing;

    get diagnostics affected_rows = row_count;
    inserted_count := inserted_count + affected_rows;
  end loop;

  raise notice '% nouvelle(s) ville(s) ajoutée(s). Activation des nouvelles villes : %. Les tarifs non renseignés ont été ignorés.', inserted_count, activate_new_cities;
end $$;

