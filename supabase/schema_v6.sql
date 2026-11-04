-- ═══════════════════════════════════════════════════════════════════
-- Z-clean schema v6 (P0 hardening, 2026-11-04)
--
-- 1. rate_limits — fixed-window counters backing src/lib/rate-limit.ts.
--    Written ONLY through the rate_limit_hit() function by the
--    service-role client. RLS is enabled with NO policies on purpose:
--    anon/authenticated roles get nothing; the service role bypasses
--    RLS and is the only caller.
-- 2. rate_limit_hit() — atomic insert-or-increment for one
--    (key, window) bucket; returns the new count.
-- 3. Two indexes for the orders list/report access patterns (the
--    Phase 9 reports and admin queue order by created_at, often
--    filtered by status).
--
-- Idempotent: safe to run more than once in the Supabase SQL editor.
-- ═══════════════════════════════════════════════════════════════════

-- ─── 1 · rate_limits table ──────────────────────────────────────────
create table if not exists public.rate_limits (
  key          text not null,
  window_start timestamptz not null,
  count        integer not null default 0,
  primary key (key, window_start)
);

alter table public.rate_limits enable row level security;
-- Deliberately NO policies: service-role only (see header).

-- ─── 2 · atomic hit counter ─────────────────────────────────────────
create or replace function public.rate_limit_hit(
  p_key text,
  p_window_start timestamptz
)
returns integer
language sql
as $$
  insert into public.rate_limits (key, window_start, count)
  values (p_key, p_window_start, 1)
  on conflict (key, window_start)
  do update set count = public.rate_limits.count + 1
  returning count;
$$;

-- ─── 3 · orders reporting indexes ───────────────────────────────────
create index if not exists orders_created_at_idx
  on public.orders (created_at desc);

create index if not exists orders_status_created_at_idx
  on public.orders (status, created_at desc);
