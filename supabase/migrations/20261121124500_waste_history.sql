create table public.waste_imports (
  id bigint generated always as identity primary key,
  filename text not null check (length(filename) between 1 and 255),
  fingerprint text not null unique check (fingerprint ~ '^[0-9a-f]{64}$'),
  covered_from date not null,
  covered_to date not null check (covered_to >= covered_from),
  source_row_count integer not null check (source_row_count >= 0),
  skipped_row_count integer not null check (skipped_row_count >= 0),
  daily_row_count integer not null check (daily_row_count >= 0),
  quantity numeric not null,
  pa numeric not null,
  ventes numeric not null,
  imported_at timestamptz not null default now()
);

create table public.waste_products (
  id bigint generated always as identity primary key,
  variant text not null check (length(btrim(variant)) > 0),
  source_name text not null check (length(btrim(source_name)) > 0),
  category text check (length(btrim(category)) > 0),
  subcategory text check (length(btrim(subcategory)) > 0),
  unit text check (unit in ('KG', 'PCE')),
  reviewed boolean not null default false,
  unique (variant, source_name),
  check (not reviewed or (category is not null and subcategory is not null and unit is not null))
);

create table public.waste_daily (
  recorded_on date not null,
  product_id bigint not null references public.waste_products,
  import_id bigint not null references public.waste_imports,
  scan_count integer not null check (scan_count > 0),
  quantity numeric not null check (abs(quantity) < 'Infinity'::numeric),
  pa numeric not null check (abs(pa) < 'Infinity'::numeric),
  ventes numeric not null check (abs(ventes) < 'Infinity'::numeric),
  primary key (recorded_on, product_id)
);

create index waste_daily_product_date on public.waste_daily (product_id, recorded_on);

alter table public.waste_imports enable row level security;
alter table public.waste_products enable row level security;
alter table public.waste_daily enable row level security;

revoke all on public.waste_imports, public.waste_products, public.waste_daily from public, anon, authenticated;
grant select on public.waste_imports, public.waste_products, public.waste_daily to authenticated;
grant update (category, subcategory, unit, reviewed) on public.waste_products to authenticated;

create policy "Managers read waste imports" on public.waste_imports
  for select to authenticated using (
    exists (select 1 from public.rayon_members where user_id = (select auth.uid()) and role = 'manager')
  );
create policy "Managers read waste products" on public.waste_products
  for select to authenticated using (
    exists (select 1 from public.rayon_members where user_id = (select auth.uid()) and role = 'manager')
  );
create policy "Managers review waste products" on public.waste_products
  for update to authenticated using (
    exists (select 1 from public.rayon_members where user_id = (select auth.uid()) and role = 'manager')
  );
create policy "Managers read waste totals" on public.waste_daily
  for select to authenticated using (
    exists (select 1 from public.rayon_members where user_id = (select auth.uid()) and role = 'manager')
  );

create function public.apply_waste_import(p_report jsonb, p_rows jsonb, p_replace boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  report_from date := (p_report->>'covered_from')::date;
  report_to date := (p_report->>'covered_to')::date;
  accepted_count integer := (p_report->>'source_row_count')::integer;
  skipped_count integer := (p_report->>'skipped_row_count')::integer;
  import_row_id bigint;
  result_count integer;
  result_scans bigint;
  result_quantity numeric;
  result_pa numeric;
  result_ventes numeric;
  dates_valid boolean;
begin
  if not exists (
    select 1 from public.rayon_members where user_id = auth.uid() and role = 'manager'
  ) then
    raise exception 'Manager access required' using errcode = '42501';
  end if;

  if report_from is null or report_to is null or report_to < report_from
    or accepted_count is null or skipped_count is null
    or (accepted_count = 0 and skipped_count > 0)
    or jsonb_typeof(p_rows) is distinct from 'array'
  then
    raise exception 'Invalid waste report';
  end if;

  perform pg_advisory_xact_lock(740074);
  select id into import_row_id from public.waste_imports
    where fingerprint = p_report->>'fingerprint';
  if found then
    return jsonb_build_object('status', 'already_imported', 'id', import_row_id);
  end if;

  if p_replace is not true and exists (
    select 1 from public.waste_imports where covered_from <= report_to and covered_to >= report_from
  ) then
    raise exception 'This report overlaps previously imported days' using errcode = 'PT409';
  end if;

  select count(*), coalesce(sum(scan_count), 0), coalesce(sum(quantity), 0),
    coalesce(sum(pa), 0), coalesce(sum(ventes), 0),
    coalesce(bool_and(recorded_on is not null and recorded_on between report_from and report_to), true)
  into result_count, result_scans, result_quantity, result_pa, result_ventes, dates_valid
  from jsonb_to_recordset(p_rows) as row_data(
    recorded_on date, scan_count integer, quantity numeric, pa numeric, ventes numeric
  );

  if not dates_valid or result_scans <> accepted_count
    or result_quantity is distinct from (p_report->>'quantity')::numeric
    or result_pa is distinct from (p_report->>'pa')::numeric
    or result_ventes is distinct from (p_report->>'ventes')::numeric
  then
    raise exception 'Daily records do not match the waste report';
  end if;

  insert into public.waste_imports (
    filename, fingerprint, covered_from, covered_to, source_row_count,
    skipped_row_count, daily_row_count, quantity, pa, ventes
  ) values (
    p_report->>'filename', p_report->>'fingerprint', report_from, report_to, accepted_count,
    skipped_count, result_count, result_quantity, result_pa, result_ventes
  ) returning id into import_row_id;

  insert into public.waste_products as product (variant, source_name, category, subcategory, unit)
  select distinct variant, source_name, category, subcategory, unit
  from jsonb_to_recordset(p_rows) as row_data(
    variant text, source_name text, category text, subcategory text, unit text
  )
  on conflict (variant, source_name) do update
    set unit = excluded.unit
    where product.unit is null and excluded.unit is not null and not product.reviewed;

  delete from public.waste_daily where recorded_on between report_from and report_to;

  insert into public.waste_daily (recorded_on, product_id, import_id, scan_count, quantity, pa, ventes)
  select row_data.recorded_on, product.id, import_row_id, row_data.scan_count,
    row_data.quantity, row_data.pa, row_data.ventes
  from jsonb_to_recordset(p_rows) as row_data(
    recorded_on date, variant text, source_name text, scan_count integer, quantity numeric, pa numeric, ventes numeric
  )
  join public.waste_products as product using (variant, source_name);

  return jsonb_build_object('status', 'imported', 'id', import_row_id, 'daily_rows', result_count);
end;
$$;

revoke all on function public.apply_waste_import(jsonb, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.apply_waste_import(jsonb, jsonb, boolean) to authenticated;
