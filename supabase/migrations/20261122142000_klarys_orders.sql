create table if not exists public.klarys_orders (
  id bigint primary key,
  marketplace_id integer not null,
  department text not null check (department = 'RY74'),
  delivery_location_id integer not null check (delivery_location_id = 7636),
  order_date date not null,
  shipping_date date,
  shipping_location_id integer,
  shipping_packages integer check (shipping_packages >= 0),
  delivery_date date not null,
  status text not null,
  supplier_id bigint,
  supplier_name text,
  source_captured_at timestamptz not null,
  imported_at timestamptz not null default now()
);

create index if not exists klarys_orders_delivery_date_idx on public.klarys_orders (delivery_date);

create table if not exists public.klarys_order_lines (
  id bigint primary key,
  order_id bigint not null references public.klarys_orders (id),
  product_name text not null,
  gtin text,
  manor_article text,
  manor_variant text,
  internal_ref text,
  origin_id integer,
  origin_label text,
  ordered_quantity numeric not null check (ordered_quantity >= 0),
  ordered_unit_id integer not null,
  per_box numeric check (per_box >= 0),
  package_quantity_unit_id integer,
  validated_quantity numeric,
  validated_unit_id integer,
  price_amount numeric,
  price_unit_id integer,
  currency_id integer,
  status text not null,
  cancelled_by_seller boolean,
  counting_status text not null check (counting_status in ('active', 'cancelled', 'unclassified')),
  details jsonb not null check (jsonb_typeof(details) = 'object'),
  source_captured_at timestamptz not null,
  imported_at timestamptz not null default now()
);

create index if not exists klarys_order_lines_order_idx on public.klarys_order_lines (order_id);

alter table public.klarys_orders enable row level security;
alter table public.klarys_order_lines enable row level security;
revoke all on public.klarys_orders, public.klarys_order_lines from public, anon, authenticated, service_role;
