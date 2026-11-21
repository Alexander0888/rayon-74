create or replace function public.get_waste_dashboard()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'importedAt', (select max(imported_at) from public.waste_imports),
    'coverage', coalesce((
      select jsonb_agg(distinct jsonb_build_array(covered_from, covered_to))
      from public.waste_imports
    ), '[]'::jsonb),
    'products', coalesce((
      select jsonb_agg(jsonb_build_array(id, source_name, global_category, category, subcategory, variant))
      from public.waste_products
      where reviewed
    ), '[]'::jsonb),
    'entries', coalesce((
      select jsonb_agg(jsonb_build_array(d.recorded_on, d.product_id, -round(d.pa * 100), -round(d.ventes * 100)))
      from public.waste_daily d
      join public.waste_products p on p.id = d.product_id and p.reviewed
    ), '[]'::jsonb)
  )
  where exists (
    select 1 from public.rayon_members where user_id = (select auth.uid()) and role = 'manager'
  );
$$;

revoke all on function public.get_waste_dashboard() from public, anon, authenticated;
grant execute on function public.get_waste_dashboard() to authenticated;
