-- ============================================================================
-- Z-clean — Supabase / PostgreSQL schema v4 (Phase 8: QR/OTP handovers —
-- Requirements v2 §2/§3).
--
-- ADDITIVE migration: run AFTER supabase/schema_v3.sql in the Supabase SQL
-- editor. It adds the per-order handover credentials (QR token + pickup /
-- delivery OTPs) to `orders` and the append-only `handovers` ledger.
-- Every statement is guarded so the file can be re-run safely.
--
-- Design (Requirements v2 §4): handovers ATTACH to the existing order
-- lifecycle — there is no parallel status system and no current-point
-- column. Which handover an order awaits is derived from its status plus
-- the handovers already recorded (src/lib/handovers.ts). Status moves
-- still go through the order-flow rules only.
--
-- Credentials: `qr_token` is an unguessable per-order token (the QR
-- payload is `zclean:order:<qr_token>` — never the order reference).
-- `pickup_otp` / `delivery_otp` are 6-digit customer codes generated at
-- order creation; `otp_attempts` is ONE shared counter for both codes —
-- 5 failed attempts lock OTP verification until an admin regenerates.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- orders — handover credentials (guarded adds). Existing rows backfill a
-- qr_token; their OTPs stay NULL (they predate the codes) until an admin
-- generates them from the order screen — the handover API answers
-- OTP_NOT_SET until then, it never invents a code silently.
-- ----------------------------------------------------------------------------
alter table public.orders add column if not exists qr_token text;
update public.orders
  set qr_token = gen_random_uuid()::text
  where qr_token is null;
alter table public.orders
  alter column qr_token set default gen_random_uuid()::text;
do $$ begin
  alter table public.orders
    add constraint orders_qr_token_unique unique (qr_token);
exception when duplicate_object then null; end $$;

alter table public.orders add column if not exists pickup_otp text;
alter table public.orders add column if not exists pickup_otp_used_at timestamptz;
alter table public.orders add column if not exists delivery_otp text;
alter table public.orders add column if not exists delivery_otp_used_at timestamptz;
alter table public.orders
  add column if not exists otp_attempts integer not null default 0;
do $$ begin
  alter table public.orders
    add constraint orders_otp_attempts_nonneg check (otp_attempts >= 0);
exception when duplicate_object then null; end $$;

-- ----------------------------------------------------------------------------
-- handovers — one row per completed stage transfer. Append-only like
-- audit_logs / voucher_transactions: the API inserts and reads; there are
-- deliberately NO update/delete policies.
--
--   point_id          the chain point (src/lib/handovers.ts HANDOVER_CHAIN)
--   from_stage/to_stage  human labels at completion time (point label
--                     sides), so history stays readable if labels evolve
--   from_employee_id  who handed over — derived server-side from the
--                     previous handover's receiver (NULL at pickup,
--                     where the customer hands over)
--   to_employee_id    the employee who received / acted, validated
--                     server-side against the point's role + active flag
--   quantity vs expected_quantity — a difference is recorded via the
--                     'quantity_mismatch' flag, never a block
--   flags             anomaly vocabulary from the requirement plan,
--                     constrained to the known set
-- ----------------------------------------------------------------------------
create table if not exists public.handovers (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  point_id text not null,
  from_stage text not null,
  to_stage text not null,
  method text not null check (method in ('qr', 'otp')),
  from_employee_id uuid references public.employees (id) on delete set null,
  to_employee_id uuid references public.employees (id) on delete set null,
  actor_user_id uuid references public.profiles (id) on delete set null,
  actor_label text,
  quantity integer not null check (quantity >= 0),
  expected_quantity integer not null check (expected_quantity >= 0),
  flags text[] not null default '{}'
    check (flags <@ array[
      'missing_item', 'quantity_mismatch', 'duplicate',
      'wrong_order', 'unauthorized', 'otp_retry'
    ]::text[]),
  note text,
  created_at timestamptz not null default now()
);
create index if not exists handovers_order_idx
  on public.handovers (order_id, created_at);
create index if not exists handovers_point_idx
  on public.handovers (point_id, created_at);
create index if not exists handovers_to_employee_idx
  on public.handovers (to_employee_id, created_at);

-- ============================================================================
-- Row Level Security — admins only (same posture as gift_vouchers).
-- Staff act from the admin console in this phase (no employee logins
-- yet), and customers never read this table directly: the customer
-- order endpoint composes a name-free milestone list server-side.
-- ============================================================================
alter table public.handovers enable row level security;

drop policy if exists "handovers: admin read" on public.handovers;
create policy "handovers: admin read"
  on public.handovers for select
  using (public.is_admin());
drop policy if exists "handovers: admin insert" on public.handovers;
create policy "handovers: admin insert"
  on public.handovers for insert
  with check (public.is_admin());
