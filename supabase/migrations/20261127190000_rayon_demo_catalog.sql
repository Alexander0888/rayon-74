create schema rayon_demo;
revoke all on schema rayon_demo from public, anon, authenticated, service_role;

create table rayon_demo.settings (
  singleton boolean primary key default true check (singleton),
  seed uuid not null default gen_random_uuid(),
  starts_on date,
  daily_pa numeric
);
insert into rayon_demo.settings default values;

-- These names and packs identify the reviewed crosswalk without publishing the source codes.
create table rayon_demo.scene_products (
  alias text primary key,
  waste_name text not null,
  order_name text not null,
  pack numeric not null
);
insert into rayon_demo.scene_products values
  ('pineapple', 'Ananas extra sw Ananas ex', 'Ananas Extra Sweet', 8),
  ('avocado', 'Avocat Hass IMP Avocat Ha', 'Avocat Mûr à Point - Hass', 16),
  ('yellowDragon', 'Pitahaya Jaune Pitahaya', 'Pitahaya Jaune', 7);

create table rayon_demo.reserved_codes (
  kind text not null,
  code text not null,
  primary key (kind, code)
);
create table rayon_demo.codes (
  kind text not null,
  source_key text not null,
  code text not null,
  primary key (kind, source_key),
  unique (kind, code)
);

create table rayon_demo.products (
  id integer primary key,
  waste_product_id bigint unique references public.waste_products on delete set null,
  order_key text unique,
  scene_alias text unique references rayon_demo.scene_products,
  waste_name text not null,
  order_name text not null,
  category text not null,
  product_group text not null,
  subgroup text not null,
  unit text not null check (unit in ('PCE', 'KG')),
  manor_article text not null,
  manor_variant text not null,
  internal_ref text not null,
  gtin text not null,
  is_bio boolean not null,
  origin_id integer,
  origin_label text,
  ordered_unit_id integer not null check (ordered_unit_id in (5, 6, 7)),
  per_box numeric,
  package_quantity_unit_id integer,
  currency_id integer not null check (currency_id in (1, 2)),
  unit_pa numeric not null check (unit_pa > 0),
  unit_ventes numeric not null check (unit_ventes >= unit_pa),
  typical_waste numeric not null check (typical_waste > 0),
  typical_order numeric not null check (typical_order > 0),
  orders_per_week numeric not null check (orders_per_week between 0 and 6),
  weekdays numeric[] not null check (cardinality(weekdays) = 6),
  cancel_rate numeric not null,
  partial_rate numeric not null,
  partial_fraction numeric not null
);

create table rayon_demo.category_shares (
  season integer not null check (season between 0 and 12),
  category text not null,
  reference_share numeric not null,
  share numeric not null check (share > 0),
  primary key (season, category)
);

alter table rayon_demo.settings enable row level security;
alter table rayon_demo.scene_products enable row level security;
alter table rayon_demo.reserved_codes enable row level security;
alter table rayon_demo.codes enable row level security;
alter table rayon_demo.products enable row level security;
alter table rayon_demo.category_shares enable row level security;

create function rayon_demo.today()
returns date language sql stable set search_path = '' as $$
  select (now() at time zone 'Europe/Zurich')::date;
$$;

create function rayon_demo.dice(p_seed uuid, p_key text)
returns numeric language sql immutable strict set search_path = '' as $$
  select ('x' || left(md5(p_seed::text || ':' || p_key), 8))::bit(32)::bigint / 4294967296::numeric;
$$;

create function rayon_demo.fold(p_text text)
returns text language sql immutable strict set search_path = '' as $$
  select translate(lower(p_text), 'éèêëàâäîïôöùûüçœ', 'eeeeaaaiioouuuco');
$$;

create function rayon_demo.family(p_name text)
returns text language sql immutable strict set search_path = '' as $$
  select coalesce(substring(regexp_replace(rayon_demo.fold(btrim(p_name)),
    '^(bnp|tp|mini|lokal|local|bio) +', '', 'g') from '^[a-z]+'), '');
$$;

create function rayon_demo.category(p_name text)
returns text language sql immutable strict set search_path = '' as $$
  select case
    when rayon_demo.fold(p_name) ~ '^olives?\y' then 'Olives'
    when rayon_demo.fold(p_name) ~ '\y(4g|4e gamme|4eme gamme)\y|^sauce grand mere\y' then '4e gamme'
    when rayon_demo.family(p_name) in ('aneth','basilic','cerfeuil','ciboulette','citronnelle','coriandre',
      'estragon','laurier','liveche','marjolaine','melisse','menthe','origan','oseille','persil',
      'romarin','sarriette','sauge','thym','verveine') or rayon_demo.fold(p_name) ~ '^herbe de ble' then 'Herbes'
    when rayon_demo.fold(p_name) ~ '\y(fruits? secs?|sechees?|massepain)\y|^mais sec|^plateau aperitivo'
      or rayon_demo.family(p_name) in ('amande','amandes','briquette','briquettes','cacahuete','cacahuetes','chips',
      'corbeille','corbeilles','cranberries','datte','dattes','graines','mendiants','mix','noisette','noisettes','noix',
      'pignon','pignons','pistache','pistaches','selection') then 'Fruits secs'
    when rayon_demo.fold(p_name) ~ '^(pommes? de terre|pdt|champ\.)'
      or rayon_demo.family(p_name) in ('ail','artichaut','artichauts','asperge','asperges','aubergine',
      'aubergines','batavia','betterave','betteraves','blette','blettes','carotte','carottes','catalogna',
      'celeri','champignon','champignons','chicoree','chou','choux','cima','concombre','concombres',
      'cote','courge','courges','courgette','courgettes','echalote','echalotes','endive','endives',
      'epinard','epinards','fenouil','feuille','haricot','haricots','laitue','laitues','mache','mais',
      'manioc','navet','navets','oignon','oignons','pak','patate','patates','pdt','piment','piments',
      'poireau','poireaux','pois','poivron','poivrons','radis','rampon','roquette','salade','salades',
      'tomate','tomates') then 'Légumes'
    when rayon_demo.fold(p_name) ~ '^pates? des fruits\y' or rayon_demo.family(p_name) in ('abricot','abricots','ananas','arille','avocat','avocats',
      'baie','baies','banane','bananes','cerise','cerises','citron','citrons','clementine','clementines',
      'coing','figue','figues','fraise','fraises','framboise','framboises','fruit','fruits','gingembre',
      'grenade','grenades','grenadille','groseille','jus','kaki','kakis','kiwi','kiwis','kumquat','lime','limes',
      'litchi','litchis','mandarine','mandarines','mangoustan','mangoustans','mangue','mangues','marron','marrons',
      'melon','melons','mure','mures','myrtille','myrtilles','nashi','nashis','nectarine','nectarines',
      'orange','oranges','pamplemousse','pamplemousses','papaye','papayes','pasteque','pasteques',
      'peche','peches','pitahaya','pitahayas','poire','poires','pomme','pommes','prune','prunes',
      'pruneau','pruneaux','raisin','raisins') then 'Fruits'
    else 'À classer'
  end;
$$;

create function rayon_demo.base_unit(p_unit integer, p_pack numeric, p_pack_unit integer)
returns text language sql immutable set search_path = '' as $$
  select case
    when p_unit = 6 or (p_unit = 7 and p_pack > 0 and p_pack_unit = 6) then 'PCE'
    when p_unit = 5 or (p_unit = 7 and p_pack > 0 and p_pack_unit = 5) then 'KG'
    when p_unit = 7 then 'COLIS'
    else 'UNKNOWN'
  end;
$$;

create function rayon_demo.base_quantity(p_quantity numeric, p_unit integer, p_pack numeric, p_pack_unit integer)
returns numeric language sql immutable set search_path = '' as $$
  select p_quantity * case when p_unit = 7 and p_pack > 0 and p_pack_unit in (5, 6) then p_pack else 1 end;
$$;

create function rayon_demo.gtin_digit(p_body text)
returns integer language sql immutable strict set search_path = '' as $$
  select (10 - sum(substr(reverse(p_body), i, 1)::integer * (case when i % 2 = 1 then 3 else 1 end)) % 10)::integer % 10
  from generate_series(1, length(p_body)) i;
$$;

create function rayon_demo.assign_code(p_kind text, p_key text, p_model text, p_seed uuid)
returns text language plpgsql volatile strict set search_path = '' as $$
declare
  assigned text;
  result text;
  sample text;
  ch text;
  take integer;
  attempt integer := 0;
  has_check_digit boolean := p_kind = 'gtin' and p_model ~ '^(\d{8}|\d{12}|\d{13}|\d{14})$';
  leading_zeroes integer := length(p_model) - length(ltrim(p_model, '0'));
begin
  select code into assigned from rayon_demo.codes where kind = p_kind and source_key = p_key;
  if found then return assigned; end if;

  sample := left(p_model, length(p_model) - has_check_digit::integer);
  loop
    result := '';
    attempt := attempt + 1;
    if attempt > 200 then raise exception 'Demo identifier space exhausted for %', p_kind; end if;
    for i in 1..length(sample) loop
      ch := substr(sample, i, 1);
      if i <= leading_zeroes then
        result := result || '0';
      elsif ch between '0' and '9' then
        take := floor(rayon_demo.dice(p_seed, concat(p_kind, ':', p_key, ':', attempt, ':', i)) *
          case when i = leading_zeroes + 1 then 9 else 10 end);
        result := result || (take + (i = leading_zeroes + 1)::integer)::text;
      elsif ch between 'A' and 'Z' or ch between 'a' and 'z' then
        take := floor(rayon_demo.dice(p_seed, concat(p_kind, ':', p_key, ':', attempt, ':', i)) * 26);
        result := result || chr(take + case when ch between 'A' and 'Z' then 65 else 97 end);
      else
        result := result || ch;
      end if;
    end loop;
    if has_check_digit then result := result || rayon_demo.gtin_digit(result)::text; end if;
    if result <> p_model and not exists (
      select 1 from rayon_demo.reserved_codes where kind = p_kind and code = result
    ) then
      insert into rayon_demo.codes values (p_kind, p_key, result) on conflict do nothing returning code into assigned;
      if found then return assigned; end if;
    end if;
  end loop;
end;
$$;

create function rayon_demo.order_key(l public.klarys_order_lines)
returns text language sql immutable strict set search_path = '' as $$
  select jsonb_build_array(
    coalesce(nullif(l.manor_variant, ''), nullif(l.gtin, ''), nullif(l.internal_ref, ''), l.product_name),
    l.ordered_unit_id, l.per_box, l.package_quantity_unit_id
  )::text;
$$;

create function rayon_demo.initialize_catalog(p_month date)
returns void language plpgsql volatile set search_path = '' as $$
declare
  demo_seed uuid;
begin
  select seed into demo_seed from rayon_demo.settings for update;
  if exists (select 1 from rayon_demo.products)
    or not exists (select 1 from public.waste_products where reviewed)
    or not exists (select 1 from public.klarys_order_lines)
  then return; end if;

  insert into rayon_demo.reserved_codes (kind, code)
  select k.kind, k.code from public.klarys_order_lines l
  cross join lateral (values ('article', l.manor_article), ('variant', l.manor_variant),
    ('ref', l.internal_ref), ('gtin', l.gtin)) k(kind, code)
  where k.code is not null and k.code <> ''
  union
  select 'variant', variant from public.waste_products;

  with
  waste as materialized (
    select * from public.waste_products where reviewed
  ), order_history as materialized (
    select l.*, rayon_demo.order_key(l) as sku, o.delivery_date as day,
      extract(isodow from o.delivery_date)::integer as weekday,
      rayon_demo.base_quantity(l.ordered_quantity, l.ordered_unit_id, l.per_box, l.package_quantity_unit_id) as base_amount
    from public.klarys_order_lines l join public.klarys_orders o on o.id = l.order_id
    where o.department = 'RY74' and extract(isodow from o.delivery_date) <= 6
  ), catalog_orders as materialized (
    select distinct on (rayon_demo.order_key(l)) rayon_demo.order_key(l) as sku, l.*,
      rayon_demo.base_unit(l.ordered_unit_id, l.per_box, l.package_quantity_unit_id) as base_unit,
      (l.details->'is_bio' = 'true'::jsonb
        or rayon_demo.fold(l.product_name) ~ '\y(bio|biologique|bnp)\y') is true as bio
    from public.klarys_order_lines l
    order by rayon_demo.order_key(l), l.source_captured_at desc, l.id desc
  ), candidates as (
    select w.id, o.sku, s.alias, rank() over (partition by w.id order by (s.alias is null)) as w_rank,
      rank() over (partition by o.sku order by (s.alias is null)) as o_rank
    from waste w
    left join rayon_demo.scene_products s on s.waste_name = w.source_name
    join catalog_orders o on o.base_unit = w.unit
      and (o.manor_variant = w.variant or (o.product_name = s.order_name and o.per_box = s.pack and not o.bio))
  ), best_matches as (
    select *, count(*) over (partition by id) as n_waste, count(*) over (partition by sku) as n_order
    from candidates where w_rank = 1 and o_rank = 1
  ), sku_list as (
    select w.id as wid, o.sku, m.alias, coalesce(w.source_name, o.product_name) as waste_name,
      coalesce(o.product_name, w.source_name) as order_name, w.variant as waste_variant,
      coalesce(w.global_category, rayon_demo.category(o.product_name)) as category,
      coalesce(w.category, initcap(nullif(rayon_demo.family(o.product_name), '')), o.product_name) as product_group,
      coalesce(w.subcategory, o.product_name) as subgroup,
      coalesce(w.unit, nullif(nullif(o.base_unit, 'COLIS'), 'UNKNOWN'), 'PCE') as unit,
      (coalesce(o.bio, false) or coalesce(w.production_type = 'Bio', false)) as bio, w.locality,
      o.manor_article, coalesce(o.manor_variant, w.variant) as manor_variant, o.internal_ref, o.gtin,
      o.origin_id, o.origin_label,
      case when o.base_unit in ('PCE', 'KG') then o.ordered_unit_id end as ordered_unit_id,
      o.per_box, o.currency_id,
      coalesce(rayon_demo.family(o.product_name), rayon_demo.family(w.source_name)) as family
    from waste w full join best_matches m on w.id = m.id and m.n_waste = 1 and m.n_order = 1
      full join catalog_orders o on o.sku = m.sku and m.n_waste = 1 and m.n_order = 1
    where w.id is not null or o.sku is not null
  ), waste_stats as (
    select product_id, count(*)::numeric as n,
      percentile_cont(0.5) within group (order by -quantity)::numeric as quantity,
      (percentile_cont(0.5) within group (order by pa / quantity) filter (where pa < 0))::numeric as pa,
      (percentile_cont(0.5) within group (order by ventes / quantity) filter (where ventes < 0))::numeric as ventes
    from public.waste_daily where quantity < 0 and extract(isodow from recorded_on) <= 6
    group by product_id
  ), calendar_weeks as (
    select greatest(1, (max(day) - min(day) + 1) / 7.0) as weeks from order_history
  ), order_stats as (
    select sku, count(*)::numeric as n, count(distinct day) / (select weeks from calendar_weeks) as frequency,
      array[count(distinct day) filter (where weekday = 1), count(distinct day) filter (where weekday = 2),
        count(distinct day) filter (where weekday = 3), count(distinct day) filter (where weekday = 4),
        count(distinct day) filter (where weekday = 5), count(distinct day) filter (where weekday = 6)] as weekdays,
      (percentile_cont(0.5) within group (order by base_amount)
        filter (where counting_status = 'active' and base_amount > 0))::numeric as quantity,
      (percentile_cont(0.5) within group (order by price_amount * (case currency_id when 1 then 0.95 else 1 end)
        / case when price_unit_id = 7 then nullif(per_box, 0) else 1 end)
        filter (where counting_status = 'active' and price_amount > 0 and price_unit_id in (5, 6, 7)))::numeric as order_pa,
      count(*) filter (where counting_status = 'cancelled')::numeric / count(*) as cancel_rate,
      count(*) filter (where validated_quantity > 0 and validated_quantity < ordered_quantity
        and validated_unit_id = ordered_unit_id and counting_status = 'active')::numeric / count(*) as partial_rate,
      (percentile_cont(0.5) within group (order by validated_quantity / nullif(ordered_quantity, 0))
        filter (where validated_quantity > 0 and validated_quantity < ordered_quantity
          and validated_unit_id = ordered_unit_id and counting_status = 'active'))::numeric as partial_fraction
    from order_history group by sku
  ), items as materialized (
    select sku.*, w.n as waste_n, w.quantity as waste_quantity, w.pa, w.ventes,
      o.n as order_n, o.quantity as order_quantity, o.order_pa, o.frequency, o.weekdays, o.cancel_rate, o.partial_rate, o.partial_fraction,
      coalesce('waste:' || sku.wid::text, 'order:' || sku.sku) as item_key
    from sku_list sku left join waste_stats w on w.product_id = sku.wid
    left join order_stats o on o.sku = sku.sku
  ), peers as (
    select category, unit, family, grouping(family) as broader,
      (percentile_cont(0.5) within group (order by waste_quantity) filter (where waste_n >= 4))::numeric as waste_quantity,
      (percentile_cont(0.5) within group (order by pa) filter (where waste_n >= 4))::numeric as pa,
      (percentile_cont(0.5) within group (order by ventes / nullif(pa, 0)) filter (where waste_n >= 4))::numeric as markup,
      (percentile_cont(0.5) within group (order by order_quantity) filter (where order_n >= 4))::numeric as order_quantity,
      (percentile_cont(0.5) within group (order by frequency) filter (where order_n >= 4))::numeric as frequency,
      array[sum(weekdays[1]), sum(weekdays[2]), sum(weekdays[3]), sum(weekdays[4]), sum(weekdays[5]), sum(weekdays[6])] as weekdays,
      mode() within group (order by origin_id) as origin_id,
      mode() within group (order by ordered_unit_id) as order_unit,
      mode() within group (order by per_box) filter (where ordered_unit_id = 7 and per_box > 0) as pack
    from items group by grouping sets ((category, unit, family), (category, unit))
  ), profiles as (
    select i.*,
      coalesce(a.waste_quantity, b.waste_quantity, case i.unit when 'KG' then 1.2 else 2 end) as peer_waste,
      coalesce(a.pa, b.pa, case i.unit when 'KG' then 4 else 1.8 end) as peer_pa,
      coalesce(a.markup, b.markup, 1.65) as peer_markup,
      coalesce(a.order_quantity, b.order_quantity, case i.unit when 'KG' then 9 else 18 end) as peer_order,
      coalesce(a.frequency, b.frequency, 1.5) as peer_frequency,
      coalesce(a.origin_id, b.origin_id) as peer_origin,
      coalesce(i.ordered_unit_id, a.order_unit, b.order_unit, case i.unit when 'KG' then 5 else 6 end) as demo_order_unit,
      coalesce(nullif(i.per_box, 0), a.pack, b.pack, case i.unit when 'KG' then 5 else 8 end) as demo_pack,
      coalesce(i.waste_n / (i.waste_n + 8), 0) as w,
      coalesce(i.order_n / (i.order_n + 6), 0) as o,
      coalesce(a.weekdays, b.weekdays) as peer_days,
      0.8 + rayon_demo.dice(demo_seed, i.item_key || ':price') * 0.9 as price_factor
    from items i left join peers a on (i.category, i.unit, i.family, 0) = (a.category, a.unit, a.family, a.broader)
    left join peers b on (i.category, i.unit, 1) = (b.category, b.unit, b.broader)
  ), prices as (
    select profiles.*, price_factor * (
      coalesce(pa, peer_pa) * w + (1-w) * (coalesce(order_pa, peer_pa) * o + (1-o) * peer_pa)
      ) as demo_pa
    from profiles
  )
  insert into rayon_demo.products (
    id, waste_product_id, order_key, scene_alias, waste_name, order_name, category, product_group, subgroup, unit,
    manor_article, manor_variant, internal_ref, gtin, is_bio, origin_id, origin_label,
    ordered_unit_id, per_box, package_quantity_unit_id, currency_id, unit_pa, unit_ventes, typical_waste,
    typical_order, orders_per_week, weekdays, cancel_rate, partial_rate, partial_fraction
  )
  select 10000 + row_number() over (order by item_key), wid, sku, alias, waste_name, order_name,
    category, product_group, subgroup, unit,
    rayon_demo.assign_code('article', coalesce(nullif(manor_article, ''), item_key), coalesce(nullif(manor_article, ''), '100000000'), demo_seed),
    rayon_demo.assign_code('variant', coalesce(nullif(manor_variant, ''), item_key), coalesce(nullif(manor_variant, ''), '10000000000'), demo_seed),
    rayon_demo.assign_code('ref', coalesce(nullif(internal_ref, ''), item_key), coalesce(nullif(internal_ref, ''), '100000000'), demo_seed),
    rayon_demo.assign_code('gtin', coalesce(nullif(gtin, ''), item_key), coalesce(nullif(gtin, ''), '2000000000000'), demo_seed),
    bio, coalesce(case when locality = 'Local' then 311 end, origin_id, peer_origin), origin_label,
    demo_order_unit,
    case when demo_order_unit = 7 then case when unit = 'PCE' then ceil(demo_pack) else demo_pack end end,
    case when demo_order_unit = 7 then case unit when 'KG' then 5 else 6 end end,
    case currency_id when 1 then 1 else 2 end,
    greatest(0.02, round(demo_pa, 4)),
    greatest(0.02, round(demo_pa * greatest(1, coalesce(ventes / nullif(pa, 0), peer_markup)), 4)),
    least(peer_waste * 4, coalesce(waste_quantity, peer_waste) * w + peer_waste * (1-w)),
    greatest(0.1, coalesce(order_quantity, peer_order) * o + peer_order * (1-o)),
    least(5.7, greatest(0.35, coalesce(frequency, peer_frequency) * o + peer_frequency * (1-o))),
    array(select 0.5 + coalesce(weekdays[n], 0)
      + 6 * coalesce(peer_days[n] / nullif((select sum(x) from unnest(peer_days) x), 0), 1.0/6)
      from generate_series(1,6) n),
    least(0.16, 0.035 * (1-o) + coalesce(cancel_rate, 0.035) * o),
    greatest(0.06, least(0.3, 0.09 * (1-o) + coalesce(partial_rate, 0.09) * o)),
    greatest(0.55, least(0.9, coalesce(partial_fraction, 0.76)))
  from prices order by item_key;

  with actual as (
    select extract(month from d.recorded_on)::integer as season, p.global_category as category,
      greatest(0, -sum(d.pa)) as pa
    from public.waste_daily d join public.waste_products p on p.id = d.product_id and p.reviewed
    where extract(isodow from d.recorded_on) <= 6
    group by 1, 2
  ), by_category as (
    select p.global_category as category, greatest(0, -sum(d.pa)) as pa
    from public.waste_daily d join public.waste_products p on p.id = d.product_id and p.reviewed
    where extract(isodow from d.recorded_on) <= 6 group by 1
  ), by_month as (
    select extract(month from recorded_on)::integer as season, count(distinct recorded_on) as days
    from public.waste_daily where extract(isodow from recorded_on) <= 6 group by 1
  ), catalog as (
    select category, sum(unit_pa * case unit when 'PCE' then 1 else 0.02 end) as minimum_pa
    from rayon_demo.products group by 1
  ), targets as (
    select s.season, c.category,
      coalesce(b.pa / nullif(sum(b.pa) over (partition by s.season), 0), 0) as overall,
      coalesce(a.pa / nullif(sum(a.pa) over (partition by s.season), 0), 0) as seasonal,
      c.minimum_pa / sum(c.minimum_pa) over (partition by s.season) as cost_share,
      case when m.days >= 12 then m.days / (m.days + 18.0) else 0 end as season_weight
    from generate_series(0,12) s(season) cross join catalog c
    left join by_category b using (category)
    left join actual a on a.category = c.category and a.season = s.season
    left join by_month m on m.season = s.season
  ), weights as (
    select season, category, overall as reference_share,
      greatest(overall * (1-season_weight) + seasonal * season_weight, cost_share * 0.055) as adjusted
    from targets
  )
  insert into rayon_demo.category_shares
  select season, category, reference_share, adjusted / sum(adjusted) over (partition by season) from weights;

  -- The cost of a single unit per SKU sets the scale of the dense simulation.
  update rayon_demo.settings set starts_on = (p_month - interval '5 months')::date,
    daily_pa = (select greatest(1, round(2.45 * sum(unit_pa * case unit when 'PCE' then 1 else 0.02 end), 0))
      from rayon_demo.products);
end;
$$;

revoke all on all tables in schema rayon_demo from public, anon, authenticated, service_role;
revoke all on all functions in schema rayon_demo from public, anon, authenticated, service_role;
