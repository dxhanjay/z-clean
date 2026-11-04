-- ============================================================================
-- Z-clean — Supabase / PostgreSQL schema v5 (Phase 9: finance + reports —
-- Requirements v2 §2 items 6–7, §3 Phase 9).
--
-- ADDITIVE migration: run AFTER supabase/schema_v4.sql in the Supabase SQL
-- editor. It adds the staff money ledger (payment_entries), the refund
-- workflow table, the expenses module and the daily cash-closing sheet,
-- and extends the orders.payment_status enum with 'partially_paid'
-- ('refunded' already exists in the v1 enum). Every statement is guarded
-- so the file can be re-run safely.
--
-- Money model (src/lib/finance.ts is the pure source of truth):
--   * `payments` (v1) keeps gateway records — Razorpay rows and, since
--     Phase 7b, gift-card rows (gateway = 'voucher', status = 'paid').
--   * `payment_entries` (this file) is the v2 ledger for money staff
--     record by hand: cash / UPI / card-machine / bank-transfer payments
--     and processed refunds. Append-only — corrections are new entries,
--     never edits.
--   * Effective paid for an order = paid `payments` rows + 'payment'
--     entries. orders.voucher_redeemed_paise is a MIRROR of the voucher
--     payments rows and is never added on top (no double counting).
--   * Legacy rule: v1 orders marked payment_status = 'paid' by the COD
--     collection action have no ledger rows; they count as settled in
--     full (see effectivePaidPaise in src/lib/finance.ts).
--
-- Money is integer paise everywhere.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- orders.payment_status — add 'partially_paid'. The enum already carries
-- 'pending', 'cod_pending', 'paid', 'failed', 'refunded' (schema.sql).
-- ADD VALUE is idempotent via IF NOT EXISTS; the new value is not USED
-- anywhere in this file, so the statement is safe inside the editor's
-- transaction.
-- ----------------------------------------------------------------------------
alter type public.payment_status add value if not exists 'partially_paid';

-- ----------------------------------------------------------------------------
-- payment_entries — the staff money ledger. One row per movement of
-- money recorded at the desk or in the field: a payment taken against an
-- order (partial or full), or a refund actually handed back (written by
-- the refund "process" step, never at request time).
-- ----------------------------------------------------------------------------
create table if not exists public.payment_entries (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  entry_type text not null check (entry_type in ('payment', 'refund')),
  method text not null check (method in (
    'cash', 'upi', 'card_machine', 'bank_transfer', 'razorpay', 'voucher'
  )),
  amount_paise integer not null check (amount_paise > 0),
  /** UPI reference / card-machine txn id / bank reference, when given. */
  reference text,
  note text,
  /** The staff member who took the money, when recorded at the desk. */
  recorded_by_employee_id uuid references public.employees (id) on delete set null,
  actor_user_id uuid references public.profiles (id) on delete set null,
  actor_label text,
  created_at timestamptz not null default now()
);
create index if not exists payment_entries_order_idx
  on public.payment_entries (order_id, created_at);
create index if not exists payment_entries_created_idx
  on public.payment_entries (created_at);
create index if not exists payment_entries_method_idx
  on public.payment_entries (method, created_at);

-- ----------------------------------------------------------------------------
-- refunds — a WORKFLOW table (unlike the append-only ledgers): a refund
-- is requested, then approved or rejected, then processed — and only the
-- processing step moves money (it writes a payment_entries 'refund'
-- row). Updates are therefore allowed, admins only.
-- ----------------------------------------------------------------------------
create table if not exists public.refunds (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  amount_paise integer not null check (amount_paise > 0),
  reason text not null,
  method text not null check (method in ('cash', 'upi', 'original_payment')),
  status text not null default 'requested'
    check (status in ('requested', 'approved', 'rejected', 'processed')),
  requested_by_user_id uuid references public.profiles (id) on delete set null,
  requested_by_label text,
  decided_by_label text,
  decided_at timestamptz,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists refunds_order_idx
  on public.refunds (order_id, created_at);
create index if not exists refunds_status_idx
  on public.refunds (status, created_at);

-- ----------------------------------------------------------------------------
-- expenses — the simple spend ledger that makes sales-vs-expense
-- reporting real: detergent, utilities, rent, fuel, packaging,
-- maintenance, salaries and miscellany, optionally per branch.
-- ----------------------------------------------------------------------------
create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  expense_date date not null,
  category text not null check (category in (
    'detergent', 'utilities', 'rent', 'fuel',
    'packaging', 'maintenance', 'salary', 'other'
  )),
  description text,
  amount_paise integer not null check (amount_paise > 0),
  branch_id uuid references public.branches (id) on delete set null,
  actor_user_id uuid references public.profiles (id) on delete set null,
  actor_label text,
  created_at timestamptz not null default now()
);
create index if not exists expenses_date_idx
  on public.expenses (expense_date);
create index if not exists expenses_category_idx
  on public.expenses (category, expense_date);

-- ----------------------------------------------------------------------------
-- cash_closings — one row per closed day. expected_cash_paise is the
-- server-computed cash expectation (cash payments − cash refunds from
-- payment_entries for that IST day) frozen at closing time; the
-- difference against the counted cash is stored, never recomputed.
-- ----------------------------------------------------------------------------
create table if not exists public.cash_closings (
  id uuid primary key default gen_random_uuid(),
  closing_date date not null unique,
  expected_cash_paise integer not null,
  counted_cash_paise integer not null check (counted_cash_paise >= 0),
  difference_paise integer not null,
  closed_by_user_id uuid references public.profiles (id) on delete set null,
  closed_by_label text,
  note text,
  created_at timestamptz not null default now()
);

-- ============================================================================
-- Row Level Security — admin-only throughout (same posture as the other
-- operations tables). Customers never read the ledger directly; the
-- receipt composes their own order's breakdown server-side.
-- ============================================================================
alter table public.payment_entries enable row level security;
alter table public.refunds         enable row level security;
alter table public.expenses        enable row level security;
alter table public.cash_closings   enable row level security;

-- payment_entries: append-only — admin read + insert, NO update/delete.
drop policy if exists "payment_entries: admin read" on public.payment_entries;
create policy "payment_entries: admin read"
  on public.payment_entries for select
  using (public.is_admin());
drop policy if exists "payment_entries: admin insert" on public.payment_entries;
create policy "payment_entries: admin insert"
  on public.payment_entries for insert
  with check (public.is_admin());

-- refunds: workflow table — admins read, insert and update.
drop policy if exists "refunds: admin read" on public.refunds;
create policy "refunds: admin read"
  on public.refunds for select
  using (public.is_admin());
drop policy if exists "refunds: admin insert" on public.refunds;
create policy "refunds: admin insert"
  on public.refunds for insert
  with check (public.is_admin());
drop policy if exists "refunds: admin update" on public.refunds;
create policy "refunds: admin update"
  on public.refunds for update
  using (public.is_admin())
  with check (public.is_admin());

-- expenses: admins manage.
drop policy if exists "expenses: admin all" on public.expenses;
create policy "expenses: admin all"
  on public.expenses for all
  using (public.is_admin())
  with check (public.is_admin());

-- cash_closings: admins manage.
drop policy if exists "cash_closings: admin all" on public.cash_closings;
create policy "cash_closings: admin all"
  on public.cash_closings for all
  using (public.is_admin())
  with check (public.is_admin());
