create table rayon_demo.months (
  starts_on date primary key check (extract(day from starts_on) = 1),
  orders_ready boolean not null default false
);
create table rayon_demo.workdays (
  day date primary key check (extract(isodow from day) <= 6)
);
create table rayon_demo.waste (
  day date not null references rayon_demo.workdays,
  product_id integer not null references rayon_demo.products,
  quantity numeric(12, 3) not null check (quantity >= 0),
  primary key (day, product_id)
);
create index rayon_demo_waste_product_date on rayon_demo.waste (product_id, day);

create table rayon_demo.orders (
  id integer primary key check (id between 9000000 and 9999999),
  delivery_on date not null references rayon_demo.workdays,
  category text not null,
  batch integer not null,
  unique (delivery_on, category, batch)
);
create table rayon_demo.order_lines (
  id integer primary key check (id between 90000000 and 99999999),
  order_id integer not null references rayon_demo.orders,
  product_id integer not null references rayon_demo.products,
  ordered_quantity numeric(12, 3) not null check (ordered_quantity > 0),
  supplier_quantity numeric(12, 3) check (supplier_quantity > 0 and supplier_quantity <= ordered_quantity),
  confirmed_on date,
  unique (order_id, product_id),
  check ((supplier_quantity is null) = (confirmed_on is null))
);
create index rayon_demo_order_lines_product on rayon_demo.order_lines (product_id, order_id);

alter table rayon_demo.months enable row level security;
alter table rayon_demo.workdays enable row level security;
alter table rayon_demo.waste enable row level security;
alter table rayon_demo.orders enable row level security;
alter table rayon_demo.order_lines enable row level security;

create function rayon_demo.make_waste_month(p_month date, p_seed uuid, p_daily_pa numeric)
returns void language plpgsql volatile set search_path = '' as $$
declare
  last_day date := (p_month + interval '1 month')::date - 1;
begin
  if exists (select 1 from rayon_demo.months where starts_on = p_month) then return; end if;

  insert into rayon_demo.workdays
  select p_month + n from generate_series(0, last_day - p_month) n
  where extract(isodow from p_month + n) <= 6;

  with days as (
    select day, extract(isodow from day)::integer as weekday,
      (date_trunc('week', day::timestamp)::date - date '2020-01-06') / 7 as week_number,
      0.5 - (day - p_month)::numeric / (last_day - p_month) as position
    from rayon_demo.workdays where day between p_month and last_day
  ), week_shape as (
    select *, case when mod(week_number, 5) = 4
      then 2 + floor(rayon_demo.dice(p_seed, 'peak:' || week_number) * 5) else 1 end as peak
    from days
  ), budgets as (
    select *, (case when weekday = peak then 1.55 else 0.94 end)
      + (rayon_demo.dice(p_seed, 'day:' || day) - 0.5) * 0.048 as weight
    from week_shape
  ), slopes as (
    select (0.20 * avg(weight)
      - avg(weight) filter (where day <= p_month + 6)
      + avg(weight) filter (where day >= last_day - 6))
      / nullif(avg(weight * position) filter (where day <= p_month + 6)
        - avg(weight * position) filter (where day >= last_day - 6)
        - 0.20 * avg(weight * position), 0) as slope
    from budgets
  ), daily as (
    select day, weight * (1 + position * greatest(0.06, least(0.46, coalesce(slope, 0.25)))) as factor
    from budgets cross join slopes
  ), picks as (
    select d.day, p.id, p.unit, p.category, p.unit_pa, p.typical_waste,
      row_number() over (partition by p.id order by rayon_demo.dice(p_seed, concat('presence:', p.id, ':', d.day)), d.day) as position,
      count(*) over (partition by p.id) as n,
      rayon_demo.dice(p_seed, concat('density:', p.id, ':', p_month)) as density
    from daily d cross join rayon_demo.products p
  ), raw as (
    select *, position <= ceil(0.70 * n) + floor(density * (floor(0.95 * n) - ceil(0.70 * n) + 1)) as active
    from picks
  ), active_rows as (
    select r.day, r.id, r.category, r.unit_pa,
      case r.unit when 'PCE' then 1 else 0.01 end as step,
      case r.unit when 'PCE' then 1 else 0.02 end as minimum,
      r.unit_pa * r.typical_waste * (0.35 + 1.3 * rayon_demo.dice(p_seed, concat('waste:', r.id, ':', r.day))) as weight
    from raw r where r.active
  ), group_costs as (
    select a.day, a.category, 1.12 * sum(a.minimum * a.unit_pa) as reserved,
      sum(a.minimum * a.unit_pa) as cost_floor, sum(a.weight) as total_weight
    from active_rows a group by 1,2
  ), desired as (
    select c.*, p_daily_pa * d.factor / avg_day.factor as daily_pa, s.share
    from group_costs c join daily d on d.day = c.day
    cross join (select avg(factor) as factor from daily) avg_day
    join rayon_demo.category_shares s on s.category = c.category and s.season = extract(month from p_month)
  ), extra as (
    select *, greatest(0, daily_pa * share - reserved) as wanted,
      greatest(0, daily_pa - sum(reserved) over (partition by day)) as available
    from desired
  ), distribution as (
    select day, category, total_weight,
      reserved - cost_floor + coalesce(available * wanted / nullif(sum(wanted) over (partition by day), 0), 0) as extra_pa
    from extra
  ), quantities as (
    select a.day, a.id, a.step, (a.minimum + d.extra_pa * a.weight / d.total_weight / a.unit_pa) / a.step as increments
    from active_rows a join distribution d using (day, category)
  )
  insert into rayon_demo.waste (day, product_id, quantity)
  select r.day, r.id, coalesce(q.step * (floor(q.increments) +
    (rayon_demo.dice(p_seed, concat('round:', r.id, ':', r.day)) < q.increments - floor(q.increments))::integer), 0)
  from raw r left join quantities q on (q.day, q.id) = (r.day, r.id);

  insert into rayon_demo.months (starts_on) values (p_month);
end;
$$;

create function rayon_demo.make_orders_month(p_month date, p_seed uuid)
returns void language plpgsql volatile set search_path = '' as $$
declare
  last_day date := (p_month + interval '1 month')::date - 1;
begin
  if (select orders_ready from rayon_demo.months where starts_on = p_month) then return; end if;

  with calendar as (
    select d.day, date_trunc('week', d.day::timestamp)::date as monday,
      extract(isodow from d.day)::integer as weekday
    from rayon_demo.workdays d where d.day between p_month and last_day + 28
  ), profiles as (
    select p.id, p.weekdays, p.orders_per_week, p.cancel_rate,
      case when p.category in ('Olives', 'Fruits secs') and p.orders_per_week < 1.25
        then 2 else 1 end as interval_weeks,
      (select sum(weight) from unnest(p.weekdays) weight) as total_weight
    from rayon_demo.products p
  ), weeks as (
    select p.*, c.monday, (c.monday - date '2020-01-06') / 7 as week_number,
      rayon_demo.dice(p_seed, concat('shipment:', p.id, ':', c.monday)) * p.total_weight as draw
    from (select distinct monday from calendar) c cross join profiles p
  ), regular as (
    select w.*, (
      select min(day.idx) from (
        select idx, sum(weight) over (order by idx) as weight
        from unnest(w.weekdays) with ordinality day(weight, idx)
      ) day where day.weight > w.draw
    ) as chosen_weekday
    from weeks w
  ), candidates as (
    select c.day, w.id,
      c.weekday = w.chosen_weekday and mod(w.week_number + w.id, w.interval_weeks) = 0 as anchor,
      least(0.96, greatest(0, w.orders_per_week - 1.0 / w.interval_weeks)
        * w.weekdays[c.weekday] / greatest(0.5, w.total_weight - w.weekdays[w.chosen_weekday])) as extra_probability,
      w.cancel_rate,
      rayon_demo.dice(p_seed, concat('cancel:', w.id, ':', c.day)) as cancellation_draw,
      rayon_demo.dice(p_seed, concat('extra:', w.id, ':', c.day)) as extra_draw
    from calendar c join regular w using (monday)
  ), shipments as materialized (
    select day, id, not anchor and cancellation_draw < cancel_rate as cancelled
    from candidates where anchor or extra_draw < extra_probability
      or (extra_draw < 0.14 and cancellation_draw < cancel_rate)
  ), upcoming as (
    select day, id, false as cancelled,
      lead(day) over (partition by id order by day) as next_day
    from shipments where not cancelled
    union all
    select day, id, true, null from shipments where cancelled
  ), planned as (
    select u.day, p.id, p.category, u.cancelled,
      floor(rayon_demo.dice(p_seed, concat('order-batch:', p.id, ':', u.day)) * 4)::integer as batch,
      greatest(p.typical_order * (0.72 + 0.56 * rayon_demo.dice(p_seed, concat('order-volume:', p.id, ':', u.day))),
        (2.5 + rayon_demo.dice(p_seed, concat('stock:', p.id, ':', u.day))) *
          coalesce((
            select sum(w.quantity) from rayon_demo.waste w
            where w.product_id = p.id and w.day >= u.day and w.day < u.next_day
          ), 0)) / case when p.ordered_unit_id = 7 then p.per_box else 1 end as confirmed,
      case when p.ordered_unit_id = 5 then 0.1 else 1 end as step,
      case when rayon_demo.dice(p_seed, concat('partial:', p.id, ':', u.day)) < p.partial_rate
        then p.partial_fraction else 1 end as fraction,
      u.day - floor(rayon_demo.dice(p_seed, concat('confirm-on:', p.id, ':', u.day)) * 3)::integer as confirmed_on
    from upcoming u join rayon_demo.products p on p.id = u.id
    where u.day between p_month and last_day
  ), amounts as materialized (
    select *, greatest(step, ceil(confirmed / step) * step) as confirmed_quantity
    from planned
  ), groups as (
    select distinct day, category, batch from amounts
  ), headers as (
    insert into rayon_demo.orders (id, delivery_on, category, batch)
    select (select coalesce(max(id), 8999999) from rayon_demo.orders)
      + row_number() over (order by day, category, batch), day, category, batch from groups
    returning id, delivery_on, category, batch
  )
  insert into rayon_demo.order_lines (id, order_id, product_id, ordered_quantity, supplier_quantity, confirmed_on)
  select (select coalesce(max(id), 89999999) from rayon_demo.order_lines)
    + row_number() over (order by h.id, a.id),
    h.id, a.id, ceil(a.confirmed_quantity / a.fraction / a.step) * a.step,
    case when not a.cancelled then a.confirmed_quantity end,
    case when not a.cancelled then a.confirmed_on - (extract(isodow from a.confirmed_on) = 7)::integer end
  from amounts a join headers h on (a.day, a.category, a.batch) = (h.delivery_on, h.category, h.batch)
  order by h.id, a.id;

  update rayon_demo.months set orders_ready = true where starts_on = p_month;
end;
$$;

create function rayon_demo.generate_history(p_today date default rayon_demo.today())
returns void language plpgsql volatile set search_path = '' as $$
declare
  current_month date := date_trunc('month', p_today::timestamp)::date;
  orders_through date := date_trunc('month', (p_today + 14)::timestamp)::date;
  cursor_month date;
  initial_month date;
  demo_seed uuid;
  baseline numeric;
begin
  perform rayon_demo.initialize_catalog(current_month);
  select (starts_on - interval '1 month')::date, seed, daily_pa into initial_month, demo_seed, baseline
  from rayon_demo.settings for update;
  if initial_month is null then return; end if;

  cursor_month := initial_month;
  while cursor_month <= (orders_through + interval '1 month')::date loop
    perform rayon_demo.make_waste_month(cursor_month, demo_seed, baseline);
    cursor_month := (cursor_month + interval '1 month')::date;
  end loop;

  cursor_month := initial_month;
  while cursor_month <= orders_through loop
    perform rayon_demo.make_orders_month(cursor_month, demo_seed);
    cursor_month := (cursor_month + interval '1 month')::date;
  end loop;
end;
$$;

revoke all on all tables in schema rayon_demo from public, anon, authenticated, service_role;
revoke all on all functions in schema rayon_demo from public, anon, authenticated, service_role;

select cron.unschedule(jobid) from cron.job where jobname = 'waste-demo-generate-days';
select cron.schedule('rayon-demo-generate-history', '5 * * * *', 'select rayon_demo.generate_history()');
select rayon_demo.generate_history();
