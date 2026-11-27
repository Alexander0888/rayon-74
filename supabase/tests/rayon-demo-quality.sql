\set ON_ERROR_STOP on
\pset pager off
\timing on
begin;

create temporary table snapshot as select public.get_demo_waste_report() as data;
create temporary table report_days as
  select day::date, (idx - 1)::integer as idx
  from snapshot, jsonb_array_elements_text(data->'days') with ordinality as d(day, idx);
create temporary table report_waste as
  select d.day, (entry->>1)::integer as product_id, (entry->>2)::integer as pa
  from snapshot, jsonb_array_elements(data->'entries') entry
  join report_days d on d.idx = (entry->>0)::integer;
create temporary table report_daily as
  select d.day, date_trunc('month', d.day::timestamp)::date as month,
    coalesce(sum(w.pa), 0) / 100.0 as pa
  from report_days d left join report_waste w using (day) group by d.day;
create temporary table report_months as
  select month, count(*) as workdays, avg(pa) as mean_pa,
    avg(pa) filter (where day <= month + 6) as early_pa,
    avg(pa) filter (where day >= (month + interval '1 month')::date - 7) as late_pa
  from report_daily
  where month < date_trunc('month', rayon_demo.today()::timestamp)::date
  group by month
  having count(*) = (
    select count(*) from generate_series(0, (month + interval '1 month')::date - month - 1) n
    where extract(isodow from month + n) <= 6
  );
create temporary table report_weeks as
  select date_trunc('week', day::timestamp)::date as monday, (array_agg(day order by pa desc, day))[1] as peak
  from report_daily group by 1 having count(*) = 6;
create temporary table report_density as
  select m.month, p.id, count(w.day)::numeric / m.workdays as share
  from report_months m cross join rayon_demo.products p
  left join report_waste w on w.product_id = p.id and w.day >= m.month and w.day < m.month + interval '1 month'
  group by m.month, p.id, m.workdays;

\echo 'Catalogue, couverture et identifiants'
select (select count(*) from public.waste_products where reviewed) as source_waste_products,
  (select count(distinct rayon_demo.order_key(l)) from public.klarys_order_lines l) as source_order_products,
  count(*) as demo_products, count(waste_product_id) as linked_waste, count(order_key) as linked_orders,
  count(*) filter (where waste_product_id is not null and order_key is not null) as linked_both,
  count(distinct id) as unique_product_ids, count(distinct manor_variant) as unique_variant_codes
from rayon_demo.products;
select kind, count(*) as entities, count(distinct code) as distinct_synthetic
from rayon_demo.codes group by kind order by kind;
select
  count(*) as order_lines,
  count(distinct order_id) as orders,
  count(*) filter (where counting_status = 'cancelled') as cancelled,
  count(*) filter (where validated_quantity < ordered_quantity) as partially_confirmed,
  count(*) filter (where counting_status = 'active' and validated_quantity is null) as awaiting_confirmation
from rayon_demo.visible_orders;

\echo 'Premiers et derniers jours ouvrés des mois complets'
select month, workdays, round(mean_pa, 2) as average_chf, round(early_pa, 2) as first_seven_chf,
  round(late_pa, 2) as last_seven_chf, round(100 * (early_pa - late_pa) / mean_pa, 2) as difference_pct
from report_months order by month;
select count(*) as full_weeks, count(*) filter (where peak = monday) as monday_peaks,
  round(100.0 * count(*) filter (where peak = monday) / nullif(count(*), 0), 2) as monday_pct,
  count(*) filter (where date_trunc('month', monday::timestamp) <> date_trunc('month', (monday + 5)::timestamp)) as crossing_months,
  array_agg(distinct extract(isodow from peak) order by extract(isodow from peak)) as peak_weekdays
from report_weeks;

\echo 'Fréquence par article et répartition des CHF'
select count(*) as product_months, round(100 * min(share), 2) as minimum_pct, round(100 * max(share), 2) as maximum_pct,
  count(*) filter (where share not between 0.70 and 0.95) as outside_range,
  count(distinct id) filter (where share not between 0.70 and 0.95) as products_outside_range
from report_density;
with totals as (
  select p.category, sum(w.pa) as pa from report_waste w
  join rayon_demo.products p on p.id = w.product_id
  where exists (select 1 from report_months m where w.day >= m.month and w.day < m.month + interval '1 month')
  group by p.category
)
select t.category, round(100 * s.reference_share, 2) as reference_pct,
  round(100 * t.pa / sum(t.pa) over (), 2) as demo_pct,
  round(100 * (t.pa / sum(t.pa) over () - s.reference_share), 2) as difference_points
from totals t join rayon_demo.category_shares s on s.category = t.category and s.season = 0
order by t.pa desc;

create temporary table stock_intervals as
with deliveries as (
  select o.delivery_on as first_day, l.product_id,
    lead(o.delivery_on) over (partition by l.product_id order by o.delivery_on) as next_day,
    rayon_demo.base_quantity(l.supplier_quantity, p.ordered_unit_id, p.per_box, p.package_quantity_unit_id) as supplied
  from rayon_demo.orders o join rayon_demo.order_lines l on l.order_id = o.id
  join rayon_demo.products p on p.id = l.product_id
  where l.supplier_quantity is not null
)
select d.*, coalesce((
  select sum(w.quantity) from rayon_demo.waste w where w.product_id = d.product_id and w.day >= d.first_day and w.day < d.next_day
), 0) as disposed
from deliveries d where d.next_day <= rayon_demo.today() + 1;
select count(*) as checked_intervals, count(*) filter (where disposed > supplied) as deficits,
  count(*) filter (where extract(isodow from first_day) = 6 and next_day > first_day + 3 and disposed > 0) as saturday_carry,
  count(*) filter (where date_trunc('month', first_day::timestamp) <> date_trunc('month', (next_day-1)::timestamp)) as month_carry
from stock_intervals;

do $$
declare
  week_share numeric;
begin
  if (select count(*) from report_months) < 5 then raise exception 'At least five complete demo months are required'; end if;
  if exists (select 1 from report_months where (early_pa-late_pa)/mean_pa not between 0.18 and 0.22) then
    raise exception 'Monthly loss trend outside tolerance';
  end if;
  select avg((peak = monday)::integer) into week_share from report_weeks;
  if week_share is null or week_share not between 0.74 and 0.86
    or not exists (select 1 from report_weeks where date_trunc('month', monday::timestamp) <> date_trunc('month', (monday+5)::timestamp))
    or (select count(distinct extract(isodow from peak)) from report_weeks where peak <> monday) < 2
  then raise exception 'Unexpected distribution of weekly loss peaks'; end if;
  if exists (select 1 from report_density where share not between 0.7 and 0.95) then
    raise exception 'A product-month violates the heatmap density requirement';
  end if;
  if exists (select 1 from stock_intervals where disposed > supplied)
    or not exists (select 1 from stock_intervals where disposed > 0 and extract(isodow from first_day) = 6 and next_day > first_day + 3)
  then raise exception 'Stock continuity check failed'; end if;
  if exists (select 1 from report_days where day > rayon_demo.today() or extract(isodow from day) = 7)
    or exists (select 1 from rayon_demo.visible_orders where day > rayon_demo.today() + 14 or extract(isodow from day) = 7)
    or not exists (select 1 from rayon_demo.visible_orders where day > rayon_demo.today())
  then raise exception 'The visible calendar is outside its working dates'; end if;
  if exists (
    select 1 from public.waste_products w where w.reviewed and not exists (
      select 1 from rayon_demo.products p where p.waste_product_id = w.id and p.waste_name = w.source_name
    )
  ) or exists (
    select 1 from public.klarys_order_lines l where not exists (
      select 1 from rayon_demo.products p where p.order_key = rayon_demo.order_key(l)
    )
  ) then raise exception 'The demo catalog does not cover both sources'; end if;
  if exists (select 1 from rayon_demo.codes join rayon_demo.reserved_codes using (kind, code))
    or exists (select 1 from rayon_demo.orders d join public.klarys_orders r using (id))
    or exists (select 1 from rayon_demo.order_lines d join public.klarys_order_lines r using (id))
    or exists (select 1 from rayon_demo.products where gtin ~ '^\d{8}$|^\d{12,14}$'
      and right(gtin, 1)::integer <> rayon_demo.gtin_digit(left(gtin, -1)))
  then raise exception 'Invalid or reused source identifier'; end if;
  if exists (select 1 from rayon_demo.waste w join rayon_demo.products p on p.id = w.product_id
    where p.unit = 'PCE' and w.quantity <> trunc(w.quantity))
    or exists (select 1 from rayon_demo.products where unit <>
      rayon_demo.base_unit(ordered_unit_id, per_box, package_quantity_unit_id))
    or not exists (select 1 from rayon_demo.waste w join rayon_demo.products p on p.id = w.product_id
      where p.unit = 'KG' and w.quantity <> trunc(w.quantity))
  then raise exception 'Waste or packaging quantities use inconsistent units'; end if;
  if (select count(*) from rayon_demo.products where scene_alias is not null
      and waste_product_id is not null and order_key is not null) <> 3
    or exists (select 1 from rayon_demo.scene_products s join rayon_demo.products p on p.scene_alias = s.alias
      where p.per_box <> s.pack or p.package_quantity_unit_id <> 6)
  then raise exception 'The three cart product mappings do not match both sources and their packs'; end if;
  if has_schema_privilege('anon', 'rayon_demo', 'USAGE')
    or has_schema_privilege('authenticated', 'rayon_demo', 'USAGE')
    or has_function_privilege('anon', 'rayon_demo.generate_history(date)', 'EXECUTE')
    or has_function_privilege('anon', 'public.get_cart_product_hud(text)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.get_demo_product_hud(text)', 'EXECUTE')
  then raise exception 'A private object is accessible to a browser role'; end if;
end;
$$;

\echo 'Vérification du produit Hass, des zéros et du dimanche'
create temporary table example as
select p.id, p.manor_variant, p.unit_pa, date_trunc('week', rayon_demo.today()::timestamp)::date as monday
from rayon_demo.products p where p.scene_alias = 'avocado';

-- Compare the actual current snapshots before setting the controlled example.
with hud as (
  select e.*, public.get_demo_product_hud('avocado') as data from example e
), hud_waste as (
  select q.*, (row->>'day')::date as day, (row->>'quantity')::numeric as quantity
  from hud q, jsonb_array_elements(data->'waste') row
)
select product_id, w.day, w.quantity as waste_pieces, r.pa / 100.0 as waste_chf
from (select id as product_id, day, quantity from hud_waste where quantity > 0) w join report_waste r using (day, product_id)
order by w.day desc limit 1;

savepoint example_fixture;
update rayon_demo.waste w set quantity = 6 from example e where (w.day, w.product_id) = (e.monday, e.id);
delete from rayon_demo.order_lines l using rayon_demo.orders o, example e
where l.order_id = o.id and (o.delivery_on, l.product_id) = (e.monday, e.id);
with headers as (
  insert into rayon_demo.orders select 9999998 + n, e.monday, 'Fruits', 99 + n
  from example e, generate_series(0,1) n returning *
)
insert into rayon_demo.order_lines
select 99999998 + h.batch - 99, h.id, e.id,
  case h.batch when 99 then 3 else 8 end,
  case when h.batch = 99 then 2 end, case when h.batch = 99 then e.monday end
from headers h cross join example e;

do $$
declare
  sample record;
  hud jsonb;
  report jsonb;
  orders jsonb;
  extra jsonb;
  zero_day date;
  leading_gtin text;
begin
  select * into strict sample from example;
  hud := public.get_demo_product_hud('avocado');
  report := public.get_demo_waste_report();
  orders := public.get_demo_orders(sample.monday, sample.monday, sample.manor_variant);
  if (select sum((r->>'quantity')::numeric) from jsonb_array_elements(hud->'orders') r
      where r->>'day' = sample.monday::text and r->>'kind' = 'ordered') is distinct from 48::numeric
    or (select sum((r->>'quantity')::numeric) from jsonb_array_elements(hud->'waste') r
      where r->>'day' = sample.monday::text) is distinct from 6::numeric
    or not exists (select 1 from jsonb_array_elements(report->'entries') r
      where (r->>1)::integer = sample.id and report->'days'->>((r->>0)::integer) = sample.monday::text
        and (r->>2)::numeric = round(6 * sample.unit_pa * 100))
    or not exists (select 1 from jsonb_array_elements(orders->'lines') r
      where (r->>'product_id')::integer = sample.id and r->>'counting_status' = 'active'
        and (r->>'ordered_quantity')::numeric = 3 and (r->>'per_box')::numeric = 16
        and (r->>'validated_quantity')::numeric = 2)
    or not exists (select 1 from jsonb_array_elements(orders->'lines') r
      where (r->>'product_id')::integer = sample.id and r->>'counting_status' = 'cancelled')
  then raise exception 'Hass does not reconcile across all three browser APIs'; end if;
  if jsonb_array_length(public.get_demo_orders(sample.monday - 1, sample.monday - 1)->'lines') <> 0
    or (hud->'wasteDays') ? ((sample.monday - 1)::text)
    or (hud->'orderDays') ? ((sample.monday - 1)::text)
  then raise exception 'Sunday leaked into a guest report'; end if;
  select (r->>'day')::date into zero_day from jsonb_array_elements(hud->'waste') r
  where (r->>'quantity')::numeric = 0 limit 1;
  if zero_day is null or not (hud->'wasteDays' ? zero_day::text)
    or not (report->'days' ? zero_day::text) or exists (
      select 1 from jsonb_array_elements(report->'entries') r where (r->>1)::integer = sample.id
        and report->'days'->>((r->>0)::integer) = zero_day::text
    ) then raise exception 'A covered zero is not distinguishable from a missing day'; end if;
  select public.get_demo_product_hud(id::text) into extra
  from rayon_demo.products where scene_alias is null and waste_product_id is null order by id limit 1;
  if jsonb_array_length(extra->'waste') < 20 or jsonb_array_length(extra->'orders') < 1 then
    raise exception 'An order-only product cannot drive a new HUD';
  end if;
  select rayon_demo.assign_code('gtin', 'local-quality-leading-zeroes', '00012345678905', seed)
  into leading_gtin from rayon_demo.settings;
  if length(leading_gtin) <> 14 or left(leading_gtin, 3) <> '000' or substr(leading_gtin, 4, 1) = '0'
    or right(leading_gtin, 1)::integer <> rayon_demo.gtin_digit(left(leading_gtin, -1))
  then raise exception 'A leading-zero GTIN was not preserved'; end if;
  raise notice 'Hass: 6 pieces = % CHF, 3 x 16 = 48 ordered, 2 x 16 = 32 confirmed', round(6*sample.unit_pa,2);
  raise notice 'Covered zero: %, extra HUD product: %', zero_day, extra->>'productId';
end;
$$;
rollback to example_fixture;

\echo 'Relance et interruption simulée'
create function pg_temp.history_digest() returns text language sql as $$
  select md5(concat_ws(':',
    (select md5(string_agg(p::text, ',' order by id)) from rayon_demo.products p),
    (select md5(string_agg(w::text, ',' order by day, product_id)) from rayon_demo.waste w),
    (select md5(string_agg(o::text, ',' order by id)) from rayon_demo.orders o),
    (select md5(string_agg(l::text, ',' order by id)) from rayon_demo.order_lines l)
  ));
$$;
select pg_temp.history_digest() as baseline_hash \gset
select rayon_demo.generate_history();
select 1 / (pg_temp.history_digest() = :'baseline_hash')::integer as unchanged_on_retry;
savepoint interrupted_generation;
select rayon_demo.generate_history(rayon_demo.today() + 45);
select pg_temp.history_digest() as future_hash \gset
rollback to interrupted_generation;
select 1 / (pg_temp.history_digest() = :'baseline_hash')::integer as rolled_back;
select rayon_demo.generate_history(rayon_demo.today() + 45);
select 1 / (pg_temp.history_digest() = :'future_hash')::integer as identical_after_restart;
select 1 / (public.get_demo_waste_report() = (select data from snapshot))::integer as future_waste_hidden;

rollback;
