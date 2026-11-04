-- ============================================================================
-- Z-clean — Supabase / PostgreSQL schema (Phase 1)
-- Implements the data model in ~/workspace/z-clean/ARCHITECTURE.md §6.
--
-- Run in the Supabase SQL editor (or `supabase db push`) on a fresh project.
-- All money is integer paise. Prices live in `price_items` (admin-editable),
-- never hardcoded in the app. Business details live in `settings`.
-- Row Level Security is enabled on every table:
--   * customers see and modify only their own rows
--   * users with profiles.role = 'admin' have full access via policy
-- ============================================================================

create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- Enums
-- ----------------------------------------------------------------------------
-- Idempotent (DO + duplicate_object guard) so the script can be re-run
-- safely after a partial failure.
do $$ begin
  create type public.user_role as enum ('customer', 'admin');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.pricing_unit as enum ('kg', 'piece', 'pair', 'sqft');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.delivery_type as enum ('regular', 'express');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.payment_method as enum ('razorpay', 'cod');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.payment_status as enum (
    'pending',        -- not yet attempted / awaiting gateway
    'cod_pending',    -- pay on delivery: staff marks collected at delivery
    'paid',
    'failed',
    'refunded'
  );
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.gateway_payment_status as enum (
    'created', 'paid', 'failed', 'refunded'
  );
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.order_status as enum (
    'PLACED',
    'PICKUP_SCHEDULED',
    'PICKED_UP',
    'RECEIVED',
    'IN_PROCESS',
    'READY',
    'OUT_FOR_DELIVERY',
    'DELIVERED',
    'CANCELLED',
    'PAYMENT_PENDING',
    'PAYMENT_FAILED',
    'REFUNDED'
  );
exception when duplicate_object then null; end $$;

-- ----------------------------------------------------------------------------
-- profiles — one row per auth user
-- ----------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role public.user_role not null default 'customer',
  name text,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- Helper: is the current user an admin?
-- security definer + fixed search_path so RLS policies can call it safely.
-- NOTE: this MUST be defined after public.profiles exists — a SQL-language
-- function body is validated at creation time and references the table
-- (defining it earlier failed the live run with ERROR 42P01).
-- ----------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- Create a profile automatically when a user signs up (Supabase Auth).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name, phone)
  values (
    new.id,
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'phone'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ----------------------------------------------------------------------------
-- addresses
-- ----------------------------------------------------------------------------
create table public.addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  label text not null default 'Home',
  line text not null,
  area text,
  city text not null,
  pincode text not null,
  latitude double precision,
  longitude double precision,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index addresses_user_id_idx on public.addresses (user_id);

-- ----------------------------------------------------------------------------
-- services + price_items (catalogue; matches src/lib/services.ts seed below)
-- ----------------------------------------------------------------------------
create table public.services (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  pricing_unit public.pricing_unit not null,
  turnaround_hours integer,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.price_items (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.services (id) on delete cascade,
  item_name text not null,
  price_paise integer not null check (price_paise >= 0),
  express_multiplier numeric(4, 2) not null default 1.50 check (express_multiplier >= 1),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (service_id, item_name)
);
create index price_items_service_id_idx on public.price_items (service_id);

-- ----------------------------------------------------------------------------
-- service_areas — gates pickup scheduling. Seeded with the owner's REAL
-- launch areas only (Phase 2). Intentionally empty in this file.
-- ----------------------------------------------------------------------------
create table public.service_areas (
  id uuid primary key default gen_random_uuid(),
  city text not null,
  area text not null,
  pincode text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (city, area)
);

-- ----------------------------------------------------------------------------
-- orders + order_items
-- ----------------------------------------------------------------------------
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete restrict,
  address_id uuid references public.addresses (id) on delete set null,
  delivery_type public.delivery_type not null default 'regular',
  payment_method public.payment_method not null default 'razorpay',
  status public.order_status not null default 'PLACED',
  payment_status public.payment_status not null default 'pending',
  pickup_slot timestamptz not null,
  delivery_slot timestamptz,
  subtotal_paise integer not null default 0 check (subtotal_paise >= 0),
  discount_paise integer not null default 0 check (discount_paise >= 0),
  total_paise integer not null default 0 check (total_paise >= 0),
  coupon_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index orders_user_id_idx on public.orders (user_id);
create index orders_status_idx on public.orders (status);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  price_item_id uuid references public.price_items (id) on delete set null,
  qty numeric(10, 2) not null check (qty > 0),
  unit_price_paise integer not null check (unit_price_paise >= 0),
  line_total_paise integer not null check (line_total_paise >= 0),
  created_at timestamptz not null default now()
);
create index order_items_order_id_idx on public.order_items (order_id);

-- ----------------------------------------------------------------------------
-- payments — Razorpay records. The verified webhook (Phase 3) is the only
-- writer of status = 'paid'. COD orders do not create a payments row; they
-- carry orders.payment_status = 'cod_pending' until staff marks collection.
-- ----------------------------------------------------------------------------
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  gateway text not null default 'razorpay',
  gateway_order_id text,
  gateway_payment_id text,
  amount_paise integer not null check (amount_paise >= 0),
  status public.gateway_payment_status not null default 'created',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index payments_order_id_idx on public.payments (order_id);
create unique index payments_gateway_payment_id_idx
  on public.payments (gateway_payment_id) where gateway_payment_id is not null;

-- ----------------------------------------------------------------------------
-- order_status_history — every status transition, drives the tracking timeline
-- ----------------------------------------------------------------------------
create table public.order_status_history (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  status public.order_status not null,
  note text,
  actor_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index order_status_history_order_id_idx
  on public.order_status_history (order_id, created_at);

-- ----------------------------------------------------------------------------
-- pickup_requests — Phase 2 schedule-pickup submissions. A guest (or signed-in
-- customer) requests a pickup; staff convert it into an order later (Phase 3).
-- user_id is nullable so guests can book; when set it must be the caller.
-- ----------------------------------------------------------------------------
create table public.pickup_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id) on delete set null,
  name text not null,
  phone text not null,
  address_line text not null,
  area text,
  city text not null,
  pincode text not null,
  services text[] not null default '{}',
  pickup_slot timestamptz not null,
  delivery_type public.delivery_type not null default 'regular',
  note text,
  status text not null default 'PICKUP_SCHEDULED',
  created_at timestamptz not null default now()
);
create index pickup_requests_user_id_idx on public.pickup_requests (user_id);
create index pickup_requests_phone_idx on public.pickup_requests (phone);

-- ----------------------------------------------------------------------------
-- coupons — first-order offer value is TBD by the owner; no seed row.
-- ----------------------------------------------------------------------------
create table public.coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  pct_off integer not null check (pct_off between 1 and 100),
  first_order_only boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.orders
  add constraint orders_coupon_id_fk
  foreign key (coupon_id) references public.coupons (id) on delete set null;

-- ----------------------------------------------------------------------------
-- settings — business key/values (phone, whatsapp, email, address, hours,
-- free_delivery_threshold_paise...). Values are inserted by the owner at
-- launch; intentionally no invented values are seeded here.
-- ----------------------------------------------------------------------------
create table public.settings (
  key text primary key,
  value text,
  updated_at timestamptz not null default now()
);

insert into public.settings (key, value) values
  ('business_phone', null),
  ('business_whatsapp', null),
  ('business_email', null),
  ('business_address', null),
  ('opening_hours', null),
  ('free_delivery_threshold_paise', null),
  ('first_order_offer_note', null)
on conflict (key) do nothing;

-- ----------------------------------------------------------------------------
-- Seed: services catalogue (matches src/lib/services.ts).
-- turnaround_hours stays NULL until the owner confirms real turnarounds.
-- price_items are seeded by supabase/seed_demo.sql from the owner's
-- APPROVED price list (approved 2026-11-04).
-- ----------------------------------------------------------------------------
insert into public.services (slug, name, pricing_unit) values
  ('laundry-wash-and-fold', 'Laundry Wash & Fold', 'kg'),
  ('wash-and-iron',         'Wash & Iron',         'kg'),
  ('dry-cleaning',          'Dry Cleaning',        'piece'),
  ('steam-iron-press',      'Steam Iron / Press',  'piece'),
  ('shoe-cleaning',         'Shoe Cleaning',       'pair'),
  ('leather-care',          'Leather Care',        'piece'),
  ('curtain-cleaning',      'Curtain Cleaning',    'piece'),
  ('carpet-cleaning',       'Carpet Cleaning',     'sqft')
on conflict (slug) do nothing;

-- ============================================================================
-- Row Level Security
-- ============================================================================
alter table public.profiles            enable row level security;
alter table public.addresses           enable row level security;
alter table public.services            enable row level security;
alter table public.price_items         enable row level security;
alter table public.service_areas       enable row level security;
alter table public.pickup_requests     enable row level security;
alter table public.orders              enable row level security;
alter table public.order_items         enable row level security;
alter table public.payments            enable row level security;
alter table public.order_status_history enable row level security;
alter table public.coupons             enable row level security;
alter table public.settings            enable row level security;

-- profiles: own row, or admin
create policy "profiles: select own or admin"
  on public.profiles for select
  using (id = auth.uid() or public.is_admin());
create policy "profiles: update own or admin"
  on public.profiles for update
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());
create policy "profiles: admin insert/delete"
  on public.profiles for all
  using (public.is_admin())
  with check (public.is_admin());

-- addresses: strictly own, or admin
create policy "addresses: own or admin"
  on public.addresses for all
  using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());

-- catalogue tables: anyone may read ACTIVE rows; admin manages everything
create policy "services: public read active"
  on public.services for select
  using (active = true or public.is_admin());
create policy "services: admin write"
  on public.services for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "price_items: public read active"
  on public.price_items for select
  using (active = true or public.is_admin());
create policy "price_items: admin write"
  on public.price_items for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "service_areas: public read active"
  on public.service_areas for select
  using (active = true or public.is_admin());
create policy "service_areas: admin write"
  on public.service_areas for all
  using (public.is_admin())
  with check (public.is_admin());

-- pickup_requests: guests may insert (optionally linked to their own account);
-- reads/updates are limited to the owner (when linked) or admin. Guest
-- (unlinked) requests are staff-visible only, to protect phone numbers.
create policy "pickup_requests: insert guest or own"
  on public.pickup_requests for insert
  with check (user_id is null or user_id = auth.uid());
create policy "pickup_requests: read own or admin"
  on public.pickup_requests for select
  using (user_id = auth.uid() or public.is_admin());
create policy "pickup_requests: update own or admin"
  on public.pickup_requests for update
  using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());

-- orders: own, or admin
create policy "orders: own or admin"
  on public.orders for all
  using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());

-- order_items: visible/writable only through an order the user owns, or admin
create policy "order_items: via own order or admin"
  on public.order_items for all
  using (
    public.is_admin()
    or exists (
      select 1 from public.orders o
      where o.id = order_items.order_id and o.user_id = auth.uid()
    )
  )
  with check (
    public.is_admin()
    or exists (
      select 1 from public.orders o
      where o.id = order_items.order_id and o.user_id = auth.uid()
    )
  );

-- payments: customers can READ their own; writes are server-side only
-- (service role / verified webhook bypasses RLS) or admin.
create policy "payments: read via own order or admin"
  on public.payments for select
  using (
    public.is_admin()
    or exists (
      select 1 from public.orders o
      where o.id = payments.order_id and o.user_id = auth.uid()
    )
  );
create policy "payments: admin write"
  on public.payments for all
  using (public.is_admin())
  with check (public.is_admin());

-- status history: customers read their own timeline; admin writes updates
create policy "history: read via own order or admin"
  on public.order_status_history for select
  using (
    public.is_admin()
    or exists (
      select 1 from public.orders o
      where o.id = order_status_history.order_id and o.user_id = auth.uid()
    )
  );
create policy "history: admin write"
  on public.order_status_history for all
  using (public.is_admin())
  with check (public.is_admin());

-- coupons: admin only (codes are validated server-side at checkout)
create policy "coupons: admin only"
  on public.coupons for all
  using (public.is_admin())
  with check (public.is_admin());

-- settings: anyone may read (public business info); admin writes
create policy "settings: public read"
  on public.settings for select
  using (true);
create policy "settings: admin write"
  on public.settings for all
  using (public.is_admin())
  with check (public.is_admin());
