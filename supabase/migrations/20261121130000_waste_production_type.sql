create function public.initial_waste_production_type(source_name text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when source_name ~* '\m(bio|bnp|biologique|organic)\M' then 'Bio'
    else 'Conventionnel'
  end;
$$;

alter table public.waste_products
  add column production_type text check (production_type in ('Bio', 'Conventionnel'));

update public.waste_products
set production_type = public.initial_waste_production_type(source_name);

alter table public.waste_products alter column production_type set not null;

create function public.set_initial_waste_production_type()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.production_type := coalesce(new.production_type, public.initial_waste_production_type(new.source_name));
  return new;
end;
$$;

create trigger waste_product_initial_production_type
  before insert on public.waste_products
  for each row execute function public.set_initial_waste_production_type();

revoke all on function public.initial_waste_production_type(text) from public, anon, authenticated;
revoke all on function public.set_initial_waste_production_type() from public, anon, authenticated;
grant update (production_type) on public.waste_products to authenticated;
