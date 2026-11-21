alter table public.waste_products
  add column global_category text check (
    global_category in ('Légumes', 'Fruits', '4e gamme', 'Herbes', 'Olives', 'Fruits secs')
  ),
  add column locality text check (locality in ('Local', 'Non local'));

create function public.initial_waste_locality(source_name text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when source_name ~* '\m(local|lokal)\M' then 'Local'
    else 'Non local'
  end;
$$;

update public.waste_products
set locality = public.initial_waste_locality(source_name);

alter table public.waste_products
  alter column locality set not null,
  add constraint waste_reviewed_category check (not reviewed or global_category is not null),
  add constraint waste_reviewed_local_group check (
    not reviewed or locality <> 'Local' or category ~* '^(local|lokal)\M'
  );

create index waste_reviewed_product_groups
  on public.waste_products (global_category, category) where reviewed;

create function public.prepare_waste_product()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.locality := coalesce(new.locality, public.initial_waste_locality(new.source_name));

  -- Unreviewed inserts are available during the first local history import.
  if not new.reviewed
    and exists (select 1 from public.waste_products where reviewed)
    and not exists (
      select 1 from public.waste_products
      where variant = new.variant and source_name = new.source_name and reviewed
    )
  then
    raise exception 'New products require a confirmed classification before import' using errcode = 'PT422';
  end if;

  return new;
end;
$$;

create trigger waste_product_review_and_locality
  before insert on public.waste_products
  for each row execute function public.prepare_waste_product();

revoke all on function public.initial_waste_locality(text) from public, anon, authenticated;
revoke all on function public.prepare_waste_product() from public, anon, authenticated;
grant update (global_category, locality) on public.waste_products to authenticated;
