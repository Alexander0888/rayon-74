create view rayon_demo.visible_workdays as
select day from rayon_demo.workdays
where day between (date_trunc('month', rayon_demo.today()::timestamp) - interval '5 months')::date
  and rayon_demo.today();

create view rayon_demo.visible_waste as
select w.day, w.product_id, w.quantity,
  round(w.quantity * p.unit_pa * 100)::integer as pa,
  round(w.quantity * p.unit_ventes * 100)::integer as ventes
from rayon_demo.waste w join rayon_demo.visible_workdays d using (day)
join rayon_demo.products p on p.id = w.product_id;

create view rayon_demo.visible_orders as
select o.id as order_id, o.delivery_on as day, l.id, l.product_id, l.ordered_quantity,
  case when l.confirmed_on <= rayon_demo.today() then l.supplier_quantity end as validated_quantity,
  case when l.supplier_quantity is null then 'cancelled' else 'active' end as counting_status
from rayon_demo.orders o join rayon_demo.order_lines l on l.order_id = o.id
where o.delivery_on between (date_trunc('month', rayon_demo.today()::timestamp) - interval '5 months')::date
  and rayon_demo.today() + 14;

create function public.get_demo_waste_report()
returns jsonb language sql stable security definer set search_path = '' as $$
  with days as materialized (
    select day, (row_number() over (order by day) - 1)::integer as idx from rayon_demo.visible_workdays
  )
  select jsonb_build_object(
    'coverage', coalesce((select jsonb_build_array(jsonb_build_array(min(day), max(day)))
      from days having count(*) > 0), '[]'::jsonb),
    'days', coalesce((select jsonb_agg(day order by idx) from days), '[]'::jsonb),
    'products', coalesce((
      select jsonb_agg(jsonb_build_array(id, waste_name, category, product_group, subgroup, manor_variant) order by id)
      from rayon_demo.products
    ), '[]'::jsonb),
    'entries', coalesce((
      select jsonb_agg(jsonb_build_array(d.idx, w.product_id, w.pa, w.ventes) order by d.idx, w.product_id)
      from rayon_demo.visible_waste w join days d using (day) where w.quantity > 0
    ), '[]'::jsonb)
  );
$$;

-- Keep the currently published client usable while it still expects ISO dates.
create or replace function public.get_waste_demo_dashboard()
returns jsonb language sql stable security definer set search_path = '' as $$
  with snapshot as materialized (select public.get_demo_waste_report() as data)
  select data - 'days' || jsonb_build_object('entries', coalesce((
    select jsonb_agg(jsonb_build_array(data->'days'->((entry->>0)::integer), entry->1, entry->2, entry->3)
      order by position)
    from jsonb_array_elements(data->'entries') with ordinality e(entry, position)
  ), '[]'::jsonb)) from snapshot;
$$;

create function public.get_demo_orders(
  p_from date, p_to date, p_query text default '', p_sort text default 'nameAsc', p_offsets jsonb default '{}'
)
returns jsonb language sql stable security definer set search_path = '' as $$
  with selected as materialized (
    select o.*, p.category, p.order_name as product_name,
      p.internal_ref, p.manor_article, p.manor_variant, p.gtin, p.origin_id, p.origin_label,
      p.ordered_unit_id, p.per_box, p.package_quantity_unit_id,
      case when o.validated_quantity is not null then p.ordered_unit_id end as validated_unit_id,
      round(p.unit_pa / case p.currency_id when 1 then 0.95 else 1 end, 4) as price_amount,
      case p.unit when 'KG' then 5 else 6 end as price_unit_id,
      p.currency_id, p.is_bio
    from rayon_demo.visible_orders o join rayon_demo.products p on p.id = o.product_id
    where o.day between p_from and p_to
  ), totals as (
    select s.category, a.kind, s.ordered_unit_id as unit, sum(a.amount) as quantity
    from selected s cross join lateral (values
      ('ordered', s.ordered_quantity), ('confirmed', s.validated_quantity),
      ('pending', case when s.validated_quantity is null then s.ordered_quantity end)
    ) a(kind, amount)
    where s.counting_status = 'active' and a.amount is not null group by 1,2,3
  ), words as (
    select token from regexp_split_to_table(rayon_demo.fold(btrim(left(coalesce(p_query,''),120))), '\s+') token
    where token <> ''
  ), ranked as materialized (
    select s.*, row_number() over (partition by s.category order by
      s.day, (s.counting_status = 'cancelled') desc,
      case when p_sort = 'quantityAsc' then s.ordered_quantity end,
      case when p_sort = 'quantityDesc' then s.ordered_quantity end desc,
      case when p_sort in ('quantityDesc','nameDesc') then rayon_demo.fold(s.product_name) end desc,
      rayon_demo.fold(s.product_name), s.id
    ) as position
    from selected s where not exists (
      select 1 from words where strpos(
        rayon_demo.fold(concat_ws(' ', s.product_name, s.internal_ref, s.manor_article, s.manor_variant, s.gtin)), token
      ) = 0
    )
  ), counts as (
    select category, count(*) as n from ranked group by category
  ), page as (
    select r.* from ranked r
    cross join lateral (
      select case when p_offsets->>r.category ~ '^\d{1,6}$' then (p_offsets->>r.category)::integer else 0 end as offset_n
    ) skip
    where r.position between skip.offset_n + 1 and skip.offset_n + 48
  )
  select jsonb_build_object(
    'latestDate', (select max(delivery_on) from rayon_demo.orders where delivery_on <= rayon_demo.today() + 14),
    'totals', coalesce((select jsonb_agg(jsonb_build_array(category, kind, unit, quantity) order by category, kind, unit)
      from totals), '[]'::jsonb),
    'counts', coalesce((select jsonb_object_agg(category, n) from counts), '{}'::jsonb),
    'pageSize', 48, 'hasLines', exists (select 1 from selected),
    'lines', coalesce((select jsonb_agg(to_jsonb(page) - 'position' order by day, category, position) from page), '[]'::jsonb)
  );
$$;

create function rayon_demo.product_id(p_product text)
returns integer language sql stable set search_path = '' as $$
  select id from rayon_demo.products
  where scene_alias = p_product or id = case when p_product ~ '^\d{1,9}$' then p_product::integer end;
$$;

create function public.get_demo_product_hud(p_product text)
returns jsonb language sql stable security definer set search_path = '' as $$
  with product as materialized (
    select * from rayon_demo.products where id = rayon_demo.product_id(p_product)
  ), lines as materialized (
    select o.day, o.ordered_quantity, o.validated_quantity,
      p.ordered_unit_id, p.per_box, p.package_quantity_unit_id
    from product p join rayon_demo.visible_orders o on o.product_id = p.id where o.counting_status = 'active'
  ), recent as (
    select distinct day from lines where day < rayon_demo.today() and validated_quantity > 0
    order by day desc limit 3
  ), orders as (
    select l.day, a.kind, p.unit,
      sum(rayon_demo.base_quantity(a.quantity, l.ordered_unit_id, l.per_box, l.package_quantity_unit_id)) as quantity
    from lines l cross join product p cross join lateral (values
      ('ordered', l.ordered_quantity, l.day >= rayon_demo.today() - 29),
      ('confirmed', l.validated_quantity, l.day = rayon_demo.today() or l.day in (select day from recent))
    ) a(kind, quantity, visible)
    where a.visible and a.quantity > 0 group by 1,2,3
  ), waste as (
    select w.day, p.unit, w.quantity
    from product p join rayon_demo.visible_waste w on w.product_id = p.id
    where w.day >= rayon_demo.today() - 29
  )
  select jsonb_build_object(
    'today', rayon_demo.today(), 'productId', p.id, 'name', p.order_name, 'wasteName', p.waste_name,
    'wasteUnit', p.unit, 'manorVariant', p.manor_variant,
    'orders', coalesce((select jsonb_agg(to_jsonb(o) order by day, kind, unit) from orders o), '[]'::jsonb),
    'waste', coalesce((select jsonb_agg(to_jsonb(w) order by day) from waste w), '[]'::jsonb),
    'orderDays', coalesce((select jsonb_agg(day order by day) from rayon_demo.visible_workdays d
      join rayon_demo.months m on m.starts_on = date_trunc('month', d.day::timestamp)::date and m.orders_ready
      where day >= rayon_demo.today() - 29), '[]'::jsonb),
    'wasteDays', coalesce((select jsonb_agg(day order by day) from waste), '[]'::jsonb)
  ) from product p;
$$;

-- Apply the same working calendar at the read boundary, keeping the imported rows intact.
create or replace function public.get_waste_dashboard()
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'importedAt', (select max(imported_at) from public.waste_imports),
    'coverage', coalesce((
      select jsonb_agg(distinct jsonb_build_array(covered_from, covered_to)) from public.waste_imports
    ), '[]'::jsonb),
    'products', coalesce((
      select jsonb_agg(jsonb_build_array(id, source_name, global_category, category, subcategory, variant))
      from public.waste_products where reviewed
    ), '[]'::jsonb),
    'entries', coalesce((
      select jsonb_agg(jsonb_build_array(d.recorded_on, d.product_id, -round(d.pa * 100), -round(d.ventes * 100)))
      from public.waste_daily d join public.waste_products p on p.id = d.product_id and p.reviewed
      where extract(isodow from d.recorded_on) <= 6
    ), '[]'::jsonb)
  )
  where exists (
    select 1 from public.rayon_members where user_id = (select auth.uid()) and role = 'manager'
  );
$$;

create or replace function public.get_orders_for_delivery(p_delivery_date date)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'latestDate', (select max(delivery_date) from public.klarys_orders where extract(isodow from delivery_date) <= 6),
    'lines', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', line.id,
        'product_name', line.product_name,
        'category', catalog.category,
        'internal_ref', line.internal_ref,
        'manor_article', line.manor_article,
        'manor_variant', line.manor_variant,
        'gtin', line.gtin,
        'origin_id', line.origin_id,
        'origin_label', line.origin_label,
        'ordered_quantity', line.ordered_quantity,
        'ordered_unit_id', line.ordered_unit_id,
        'per_box', line.per_box,
        'package_quantity_unit_id', line.package_quantity_unit_id,
        'validated_quantity', line.validated_quantity,
        'validated_unit_id', line.validated_unit_id,
        'price_amount', line.price_amount,
        'price_unit_id', line.price_unit_id,
        'currency_id', line.currency_id,
        'counting_status', line.counting_status,
        'is_bio', line.details->'is_bio'
      ) order by line.id)
      from public.klarys_orders purchase join public.klarys_order_lines line on line.order_id = purchase.id
      left join lateral (
        select min(global_category) as category
        from public.waste_products where reviewed and variant = line.manor_variant
        having count(distinct global_category) = 1
      ) catalog on true
      where purchase.delivery_date = p_delivery_date and extract(isodow from p_delivery_date) <= 6
    ), '[]'::jsonb)
  )
  where exists (
    select 1 from public.rayon_members where user_id = (select auth.uid()) and role = 'manager'
  );
$$;

create or replace function public.get_cart_product_hud(p_product text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  current_day date := rayon_demo.today();
  period_start date := current_day - 29;
  product rayon_demo.products;
  source_order_key text;
  source_waste_id bigint;
begin
  if not exists (
    select 1 from public.rayon_members where user_id = (select auth.uid()) and role = 'manager'
  ) then return null; end if;

  select * into product from rayon_demo.products where id = rayon_demo.product_id(p_product);
  if found then
    source_order_key := product.order_key;
    source_waste_id := product.waste_product_id;
  elsif exists (select 1 from rayon_demo.scene_products where alias = p_product) then
    -- The working cards also function before the demo catalog has been prepared.
    select min(rayon_demo.order_key(l)) into source_order_key
    from rayon_demo.scene_products s join public.klarys_order_lines l
      on s.order_name = l.product_name and s.pack = l.per_box and l.package_quantity_unit_id = 6
    where s.alias = p_product having count(distinct rayon_demo.order_key(l)) = 1;
    select min(w.id) into source_waste_id
    from rayon_demo.scene_products s join public.waste_products w on s.waste_name = w.source_name
    where s.alias = p_product and w.reviewed having count(*) = 1;
  else
    raise exception 'Produit indisponible' using errcode = '22023';
  end if;

  return (
    with order_lines as materialized (
      select purchase.delivery_date as day, l.ordered_quantity, l.ordered_unit_id, l.validated_quantity,
        l.validated_unit_id, l.per_box, l.package_quantity_unit_id
      from public.klarys_order_lines l join public.klarys_orders purchase on purchase.id = l.order_id
      where purchase.department = 'RY74' and l.counting_status = 'active'
        and (l.manor_variant = source_order_key::jsonb->>0 or l.manor_variant is null)
        and rayon_demo.order_key(l) = source_order_key and extract(isodow from purchase.delivery_date) <= 6
    ), past as (
      select distinct day from order_lines where day < current_day and validated_quantity > 0
      order by day desc limit 3
    ), amounts as (
      select l.day, a.kind, rayon_demo.base_unit(a.unit_id, l.per_box, l.package_quantity_unit_id) as unit,
        sum(rayon_demo.base_quantity(a.quantity, a.unit_id, l.per_box, l.package_quantity_unit_id)) as quantity
      from order_lines l cross join lateral (values
        ('ordered', l.ordered_quantity, l.ordered_unit_id, l.day >= period_start),
        ('confirmed', l.validated_quantity, l.validated_unit_id, l.day = current_day or l.day in (select day from past))
      ) a(kind, quantity, unit_id, visible)
      where a.visible and a.quantity > 0 group by 1,2,3
    ), waste_catalog as (
      select id, unit from public.waste_products where id = source_waste_id and reviewed
    ), waste_totals as (
      select entry.recorded_on as day, catalog.unit, -entry.quantity as quantity
      from public.waste_daily entry join waste_catalog catalog on catalog.id = entry.product_id
      where entry.recorded_on between period_start and current_day and extract(isodow from entry.recorded_on) <= 6
    ), order_days as (
      select distinct delivery_date as day from public.klarys_orders
      where department = 'RY74' and delivery_date between period_start and current_day
        and extract(isodow from delivery_date) <= 6
    ), waste_days as (
      select period_start + n as day from generate_series(0, 29) n
      where extract(isodow from period_start + n) <= 6 and exists (select 1 from waste_catalog)
        and exists (select 1 from public.waste_imports where period_start + n between covered_from and covered_to)
    )
    select jsonb_build_object(
      'today', current_day, 'name', product.order_name,
      'orders', coalesce((select jsonb_agg(to_jsonb(t) order by day, kind, unit) from amounts t), '[]'::jsonb),
      'waste', coalesce((select jsonb_agg(to_jsonb(t) order by day, unit) from waste_totals t), '[]'::jsonb),
      'orderDays', coalesce((select jsonb_agg(day order by day) from order_days), '[]'::jsonb),
      'wasteDays', coalesce((select jsonb_agg(day order by day) from waste_days), '[]'::jsonb),
      'wasteUnit', (select unit from waste_catalog)
    )
  );
end;
$$;

revoke all on all functions in schema rayon_demo from public, anon, authenticated, service_role;
revoke all on all tables in schema rayon_demo from public, anon, authenticated, service_role;
revoke all on function public.get_demo_waste_report() from public, anon, authenticated, service_role;
revoke all on function public.get_waste_demo_dashboard() from public, anon, authenticated, service_role;
revoke all on function public.get_demo_orders(date, date, text, text, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.get_demo_product_hud(text) from public, anon, authenticated, service_role;
grant execute on function public.get_demo_waste_report() to anon;
grant execute on function public.get_waste_demo_dashboard() to anon;
grant execute on function public.get_demo_orders(date, date, text, text, jsonb) to anon;
grant execute on function public.get_demo_product_hud(text) to anon;
