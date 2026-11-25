create index if not exists klarys_active_lines_variant_idx
  on public.klarys_order_lines (manor_variant, order_id) where counting_status = 'active';

create or replace function public.get_cart_product_hud(p_product text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  current_day date := (now() at time zone 'Europe/Zurich')::date;
  period_start date := current_day - 29;
  order_variant text;
  waste_variant text;
begin
  if not exists (
    select 1 from public.rayon_members
    where user_id = (select auth.uid()) and role = 'manager'
  ) then
    return null;
  end if;

  case p_product
    when 'pineapple' then
      order_variant := '10001870571';
      waste_variant := '10001786829';
    when 'avocado' then
      order_variant := '10001788941';
      waste_variant := '10001786844';
    when 'yellowDragon' then
      order_variant := '10003903482';
      waste_variant := '10001787111';
    else
      raise exception 'Produit indisponible' using errcode = '22023';
  end case;

  return (
    with order_lines as materialized (
      select purchase.delivery_date as day, line.ordered_quantity, line.ordered_unit_id,
        line.validated_quantity, line.validated_unit_id, line.per_box, line.package_quantity_unit_id
      from public.klarys_order_lines line
      join public.klarys_orders purchase on purchase.id = line.order_id
      where purchase.department = 'RY74' and line.counting_status = 'active'
        and line.manor_variant = order_variant
    ),
    past as (
      select distinct day from order_lines
      where day < current_day and validated_quantity > 0
      order by day desc limit 3
    ),
    amounts as (
      select line.day, amount.kind,
        case
          when amount.unit_id = 6 then 'PCE'
          when amount.unit_id = 5 then 'KG'
          when amount.unit_id = 7 and line.per_box > 0 and line.package_quantity_unit_id = 6 then 'PCE'
          when amount.unit_id = 7 and line.per_box > 0 and line.package_quantity_unit_id = 5 then 'KG'
          when amount.unit_id = 7 then 'COLIS'
          else 'UNKNOWN'
        end as unit,
        case when amount.unit_id = 7 and line.per_box > 0 and line.package_quantity_unit_id in (5, 6)
          then amount.quantity * line.per_box else amount.quantity end as quantity
      from order_lines line
      cross join lateral (values
        ('ordered', line.ordered_quantity, line.ordered_unit_id, line.day >= period_start),
        ('confirmed', line.validated_quantity, line.validated_unit_id,
          line.day = current_day or line.day in (select day from past))
      ) amount(kind, quantity, unit_id, visible)
      where amount.visible and amount.quantity > 0
    ),
    order_totals as (
      select day, kind, unit, sum(quantity) as quantity from amounts group by day, kind, unit
    ),
    waste_catalog as (
      select id, unit from public.waste_products where variant = waste_variant and reviewed
    ),
    waste_totals as (
      select entry.recorded_on as day, catalog.unit, -sum(entry.quantity) as quantity
      from public.waste_daily entry
      join waste_catalog catalog on catalog.id = entry.product_id
      where entry.recorded_on between period_start and current_day
      group by entry.recorded_on, catalog.unit
    ),
    order_days as (
      select distinct delivery_date as day
      from public.klarys_orders
      where department = 'RY74' and delivery_date between period_start and current_day
    ),
    waste_days as (
      select period_start + days.offset_day as day
      from generate_series(0, 29) days(offset_day)
      where exists (select 1 from waste_catalog)
        and exists (
          select 1 from public.waste_imports
          where period_start + days.offset_day between covered_from and covered_to
        )
    )
    select jsonb_build_object(
      'today', current_day,
      'orders', coalesce((select jsonb_agg(to_jsonb(t) order by day, kind, unit) from order_totals t), '[]'::jsonb),
      'waste', coalesce((select jsonb_agg(to_jsonb(t) order by day, unit) from waste_totals t), '[]'::jsonb),
      'orderDays', coalesce((select jsonb_agg(day order by day) from order_days), '[]'::jsonb),
      'wasteDays', coalesce((select jsonb_agg(day order by day) from waste_days), '[]'::jsonb),
      'wasteUnit', (select min(unit) from waste_catalog having count(distinct unit) = 1)
    )
  );
end;
$$;

revoke all on function public.get_cart_product_hud(text) from public, anon, authenticated, service_role;
grant execute on function public.get_cart_product_hud(text) to authenticated;
