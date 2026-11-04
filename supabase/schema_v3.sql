-- ============================================================================
-- Z-clean — Supabase / PostgreSQL schema v3 (Phase 7b: gift vouchers —
-- Requirements v2 §3).
--
-- ADDITIVE migration: run AFTER supabase/schema_v2.sql in the Supabase SQL
-- editor. It adds the gift-voucher tables and three voucher columns on
-- orders. It never alters v1/v2 behaviour; every statement is guarded so
-- the file can be re-run safely.
--
-- Two voucher kinds, kept strictly distinct (Requirements v2 §4):
--   * prepaid_card — a stored-balance gift card. Redemption is a PAYMENT:
--     it writes a payments row (gateway 'voucher') and reduces the balance.
--   * promo — a discount instrument. Redemption reduces the order total
--     (orders.voucher_discount_paise) and consumes one use.
--
-- Money is integer paise everywhere. Voucher codes are bearer instruments:
-- gift_vouchers is admin-only under RLS, and checkout reads/writes voucher
-- rows exclusively through the server-side service-role client.
--
-- payments note: the payments table has NO `method` column and no CHECK
-- constraining one — the instrument is recorded in `gateway` (unconstrained
-- text, default 'razorpay') and the state in the gateway_payment_status
-- enum. Voucher payments are therefore rows with gateway = 'voucher',
-- status = 'paid'. Nothing about payments needs to change in this file.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- gift_vouchers — one row per issued instrument (a campaign batch creates
-- N rows sharing the same terms, each with its own unique code).
-- ----------------------------------------------------------------------------
create table if not exists public.gift_vouchers (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  kind text not null check (kind in ('prepaid_card', 'promo')),
  -- Prepaid card: face value and remaining balance (integer paise).
  face_value_paise integer check (face_value_paise is null or face_value_paise >= 0),
  balance_paise integer check (balance_paise is null or balance_paise >= 0),
  -- Promo: discount shape. discount_value is paise when discount_type is
  -- 'fixed', or a whole percentage (1–100) when it is 'percent'.
  discount_type text check (discount_type is null or discount_type in ('fixed', 'percent')),
  discount_value integer check (discount_value is null or discount_value > 0),
  max_discount_paise integer check (max_discount_paise is null or max_discount_paise >= 0),
  min_order_paise integer not null default 0 check (min_order_paise >= 0),
  -- Service slugs (services.slug). Empty array = every service eligible.
  eligible_services text[] not null default '{}',
  branch_id uuid references public.branches (id) on delete set null,
  usage_limit integer not null default 1 check (usage_limit >= 1),
  times_used integer not null default 0 check (times_used >= 0),
  status text not null default 'created' check (status in (
    'created', 'issued', 'partially_redeemed', 'redeemed', 'expired', 'cancelled'
  )),
  issued_to_name text,
  issued_to_phone text,
  issued_to_employee_id uuid references public.employees (id) on delete set null,
  issued_by_label text,
  valid_from date,
  valid_until date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- A prepaid balance can never exceed (or outlive) its face value.
  constraint gift_vouchers_balance_within_face check (
    balance_paise is null or face_value_paise is null or balance_paise <= face_value_paise
  ),
  -- Kind/shape coherence: prepaid cards carry a balance, promos a discount.
  constraint gift_vouchers_kind_shape check (
    (kind = 'prepaid_card' and face_value_paise is not null and balance_paise is not null
      and discount_type is null and discount_value is null)
    or
    (kind = 'promo' and discount_type is not null and discount_value is not null
      and face_value_paise is null and balance_paise is null)
  )
);
create index if not exists gift_vouchers_status_idx on public.gift_vouchers (status);
create index if not exists gift_vouchers_kind_idx on public.gift_vouchers (kind);

-- ----------------------------------------------------------------------------
-- voucher_transactions — append-only ledger for every voucher event
-- (issue / redeem / adjust / cancel / expire). Same discipline as
-- audit_logs: inserts carry the actor's own id, only admins may read,
-- and there are deliberately NO update/delete policies.
-- ----------------------------------------------------------------------------
create table if not exists public.voucher_transactions (
  id uuid primary key default gen_random_uuid(),
  voucher_id uuid not null references public.gift_vouchers (id) on delete cascade,
  order_id uuid references public.orders (id) on delete set null,
  txn_type text not null check (txn_type in ('issue', 'redeem', 'adjust', 'cancel', 'expire')),
  amount_paise integer not null default 0 check (amount_paise >= 0),
  balance_after_paise integer check (balance_after_paise is null or balance_after_paise >= 0),
  actor_user_id uuid references public.profiles (id) on delete set null,
  actor_label text,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists voucher_transactions_voucher_idx
  on public.voucher_transactions (voucher_id, created_at);
create index if not exists voucher_transactions_order_idx
  on public.voucher_transactions (order_id);

-- ----------------------------------------------------------------------------
-- orders — voucher outcome columns (guarded adds).
--   voucher_code            the code the customer/cashier presented
--   voucher_discount_paise  promo discount taken off the total
--   voucher_redeemed_paise  prepaid amount PAID by gift card (a payment,
--                           not a discount — total_paise is unchanged)
-- ----------------------------------------------------------------------------
alter table public.orders add column if not exists voucher_code text;
alter table public.orders
  add column if not exists voucher_discount_paise integer not null default 0;
alter table public.orders
  add column if not exists voucher_redeemed_paise integer not null default 0;
do $$ begin
  alter table public.orders
    add constraint orders_voucher_discount_nonneg check (voucher_discount_paise >= 0);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.orders
    add constraint orders_voucher_redeemed_nonneg check (voucher_redeemed_paise >= 0);
exception when duplicate_object then null; end $$;

-- ============================================================================
-- Row Level Security
-- ============================================================================
alter table public.gift_vouchers       enable row level security;
alter table public.voucher_transactions enable row level security;

-- gift_vouchers: admins only. Checkout never touches this table with a
-- customer client — it goes through the service-role client server-side,
-- after the code has been presented by the customer.
drop policy if exists "gift_vouchers: admin only" on public.gift_vouchers;
create policy "gift_vouchers: admin only"
  on public.gift_vouchers for all
  using (public.is_admin())
  with check (public.is_admin());

-- voucher_transactions: append-only (mirrors audit_logs).
drop policy if exists "voucher_transactions: insert own" on public.voucher_transactions;
create policy "voucher_transactions: insert own"
  on public.voucher_transactions for insert
  with check (actor_user_id = auth.uid());
drop policy if exists "voucher_transactions: admin read" on public.voucher_transactions;
create policy "voucher_transactions: admin read"
  on public.voucher_transactions for select
  using (public.is_admin());
