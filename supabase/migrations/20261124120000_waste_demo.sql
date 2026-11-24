create schema waste_demo;
revoke all on schema waste_demo from public, anon, authenticated;

create table waste_demo.settings (
  id boolean primary key default true check (id),
  starts_on date not null,
  typical_daily_pa numeric
);

insert into waste_demo.settings (starts_on)
values ((now() at time zone 'Europe/Zurich')::date - 59);

create table waste_demo.products (
  id bigint generated always as identity primary key,
  article text not null unique check (article ~ '^[0-9]+$'),
  name text not null,
  category text not null,
  product_group text not null,
  subgroup text not null,
  unit text not null check (unit in ('KG', 'PCE')),
  unit_pa numeric not null check (unit_pa > 0),
  unit_ventes numeric not null check (unit_ventes > 0),
  low_quantity numeric not null check (low_quantity > 0),
  high_quantity numeric not null check (high_quantity >= low_quantity)
);

create table waste_demo.category_weights (
  month integer not null check (month between 0 and 12),
  category text not null,
  share double precision not null check (share > 0),
  primary key (month, category)
);

create table waste_demo.days (
  recorded_on date primary key
);

create table waste_demo.entries (
  recorded_on date not null references waste_demo.days,
  product_id bigint not null references waste_demo.products,
  quantity numeric not null check (quantity > 0),
  primary key (recorded_on, product_id)
);

alter table waste_demo.settings enable row level security;
alter table waste_demo.products enable row level security;
alter table waste_demo.category_weights enable row level security;
alter table waste_demo.days enable row level security;
alter table waste_demo.entries enable row level security;

create function waste_demo.initialize_catalog()
returns void
language plpgsql
set search_path = ''
as $$
declare
  product record;
  baseline numeric;
  reserved_articles text[];
  initial_article text;
  article text;
  price_factor numeric;
  digits integer;
begin
  -- Reserve both the original and the formatted numeric versions of all real articles.
  select array_agg(distinct regexp_replace(variant, '[^0-9]', '', 'g'))
    into reserved_articles
  from public.waste_products;

  for product in
    with samples as materialized (
      select p.id, p.global_category, p.category, p.unit, abs(d.quantity) as quantity,
        -d.pa as pa, -d.ventes as ventes
      from public.waste_daily d
      join public.waste_products p on p.id = d.product_id
      where p.reviewed and d.quantity <> 0 and d.pa < 0 and d.ventes < 0
    ), prices as (
      select id,
        percentile_cont(0.5) within group (order by pa / quantity) as pa,
        percentile_cont(0.5) within group (order by ventes / quantity) as ventes
      from samples group by id
    ), quantities as (
      select global_category, category, unit,
        percentile_cont(0.1) within group (order by quantity) as low,
        percentile_cont(0.9) within group (order by quantity) as high
      from samples
      group by grouping sets ((global_category, category, unit), (unit))
      having grouping(category) = 1 or count(*) >= 12
    )
    select p.source_name, p.global_category, p.category, p.subcategory, p.unit,
      length(regexp_replace(p.variant, '[^0-9]', '', 'g')) as digits, price.pa, price.ventes,
      coalesce(grp.low, units.low)::numeric as low_quantity,
      coalesce(grp.high, units.high)::numeric as high_quantity
    from prices price
    join public.waste_products p on p.id = price.id
    join quantities units on units.unit = p.unit and units.category is null
    left join quantities grp on grp.global_category = p.global_category
      and grp.category = p.category and grp.unit = p.unit
    where p.variant ~ '[0-9]'
    order by random()
  loop
    digits := product.digits;
    price_factor := 0.8 + random()::numeric * 0.9;
    select string_agg(floor(random() * 10)::integer::text, '') into initial_article
    from generate_series(1, digits);
    article := initial_article;
    while article = any(reserved_articles) loop
      article := lpad(mod(article::numeric + 1, power(10::numeric, digits))::text, digits, '0');
      exit when article = initial_article;
    end loop;
    -- A short article can run out of available replacements.
    if article = any(reserved_articles) then continue; end if;
    reserved_articles := array_append(reserved_articles, article);

    insert into waste_demo.products (
      article, name, category, product_group, subgroup, unit, unit_pa, unit_ventes, low_quantity, high_quantity
    ) values (
      article, product.source_name, product.global_category, product.category, product.subcategory, product.unit,
      product.pa::numeric * price_factor, product.ventes::numeric * price_factor,
      product.low_quantity, product.high_quantity
    );
  end loop;

  if not exists (select 1 from waste_demo.products) then return; end if;

  -- Use the overall scale and seasonal category mix, never a source day's rows or totals.
  select percentile_cont(0.5) within group (order by total)::numeric
    into baseline
  from (
    select sum(-d.pa) as total
    from public.waste_daily d
    join public.waste_products p on p.id = d.product_id
    where p.reviewed and d.pa < 0
    group by d.recorded_on
  ) as totals;

  update waste_demo.settings
  set typical_daily_pa = least(
    baseline * (0.9 + random()::numeric * 0.3),
    (select 0.75 * sum(unit_pa * (low_quantity + high_quantity) / 2) from waste_demo.products)
  ) where id;

  insert into waste_demo.category_weights (month, category, share)
  with counts as (
    select coalesce(extract(month from d.recorded_on)::integer, 0) as month,
      p.global_category as category, count(*) as row_count
    from public.waste_daily d
    join public.waste_products p on p.id = d.product_id
    where p.reviewed and d.pa < 0
    group by grouping sets ((extract(month from d.recorded_on), p.global_category), (p.global_category))
  )
  select month, category, row_count::double precision / sum(row_count) over (partition by month)
  from counts;
end;
$$;

create function waste_demo.generate_days()
returns integer
language plpgsql
set search_path = ''
as $$
declare
  today date := (now() at time zone 'Europe/Zurich')::date;
  starts_on date;
  day date;
  baseline numeric;
  target numeric;
  generated integer := 0;
begin
  -- Serialize scheduled and manual runs, including the initial catalog creation.
  select s.starts_on, s.typical_daily_pa into starts_on, baseline
  from waste_demo.settings s where s.id for update;

  if not exists (
    select 1 from generate_series(0, today - starts_on) as n
    where not exists (select 1 from waste_demo.days where recorded_on = starts_on + n)
  ) then return 0; end if;

  if baseline is null then
    perform waste_demo.initialize_catalog();
    select typical_daily_pa into baseline from waste_demo.settings;
    if baseline is null then return 0; end if;
  end if;

  for day in
    select starts_on + n from generate_series(0, today - starts_on) as n
    where not exists (select 1 from waste_demo.days where recorded_on = starts_on + n)
    order by n
  loop
    target := baseline * (1
      + 0.12 * sin((day - starts_on) / 3.5)
      + 0.08 * sin((day - starts_on) / 9.0)
      + case extract(isodow from day) when 7 then -0.08 when 6 then 0.08 else 0 end
      + (random() - 0.5) * 0.10)::numeric;

    insert into waste_demo.days (recorded_on) values (day);

    insert into waste_demo.entries (recorded_on, product_id, quantity)
    with candidates as materialized (
      select p.id, p.unit_pa,
        case p.unit when 'PCE' then greatest(1, round(sample.quantity))
          else greatest(0.001, round(sample.quantity, 3)) end as quantity,
        -ln(greatest(random(), 1e-12)) * count(*) over (partition by p.category)
          / coalesce(season.share, overall.share, 1) as priority
      from waste_demo.products p
      left join waste_demo.category_weights season
        on season.month = extract(month from day) and season.category = p.category
      left join waste_demo.category_weights overall
        on overall.month = 0 and overall.category = p.category
      cross join lateral (
        select p.low_quantity + (p.high_quantity - p.low_quantity) *
          ((random() + random()) / 2)::numeric as quantity
      ) as sample
    ), basket as (
      select id, quantity, row_number() over in_order as position,
        sum(quantity * unit_pa) over in_order as total
      from candidates
      window in_order as (order by priority, id)
    )
    select day, id, quantity from basket
    where position <= (select position from basket order by abs(total - target), position limit 1);

    generated := generated + 1;
  end loop;
  return generated;
end;
$$;

revoke all on all tables in schema waste_demo from public, anon, authenticated;
revoke all on all functions in schema waste_demo from public, anon, authenticated;

create function public.get_waste_demo_dashboard()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'coverage', coalesce((
      select jsonb_build_array(jsonb_build_array(min(recorded_on), max(recorded_on)))
      from waste_demo.days having count(*) > 0
    ), '[]'::jsonb),
    'products', coalesce((
      select jsonb_agg(jsonb_build_array(id, name, category, product_group, subgroup, article) order by id)
      from waste_demo.products
    ), '[]'::jsonb),
    'entries', coalesce((
      select jsonb_agg(jsonb_build_array(
        e.recorded_on, e.product_id, round(e.quantity * p.unit_pa * 100), round(e.quantity * p.unit_ventes * 100)
      ) order by e.recorded_on, e.product_id)
      from waste_demo.entries e join waste_demo.products p on p.id = e.product_id
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.get_waste_demo_dashboard() from public, anon, authenticated;
grant execute on function public.get_waste_demo_dashboard() to anon;

create extension if not exists pg_cron;
select cron.schedule('waste-demo-generate-days', '5 * * * *', 'select waste_demo.generate_days()');
select waste_demo.generate_days();
