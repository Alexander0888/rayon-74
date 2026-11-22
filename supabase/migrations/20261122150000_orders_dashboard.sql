create or replace function public.get_orders_for_delivery(p_delivery_date date)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'latestDate', (select max(delivery_date) from public.klarys_orders),
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
      from public.klarys_orders purchase
      join public.klarys_order_lines line on line.order_id = purchase.id
      left join lateral (
        select min(global_category) as category
        from public.waste_products
        where reviewed and variant = line.manor_variant
        having count(distinct global_category) = 1
      ) catalog on true
      where purchase.delivery_date = p_delivery_date
    ), '[]'::jsonb)
  )
  where exists (
    select 1 from public.rayon_members where user_id = (select auth.uid()) and role = 'manager'
  );
$$;

revoke all on function public.get_orders_for_delivery(date) from public, anon, authenticated, service_role;
grant execute on function public.get_orders_for_delivery(date) to authenticated;
