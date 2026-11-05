-- ═══════════════════════════════════════════════════════════════════
-- Z-clean schema v8 (Delta 2 — push notifications, 2026-11-05)
--
-- 1. push_tokens — one row per (device install, Expo push token) for
--    a signed-in user, written by POST /api/push/register and read by
--    src/lib/push.ts when an order status changes. A token is unique
--    across the table: the same physical device keeps ONE Expo token
--    even when a different account signs in on it, so registration
--    UPSERTS on expo_push_token and reassigns user_id (handled
--    server-side with the service-role client — see the route).
--    Rows for tokens Expo reports as DeviceNotRegistered are deleted
--    by the sender (pruning), and the app deletes its row on logout /
--    when the user turns order updates off.
--
-- RLS: a user can select / insert / update / delete ONLY their own
-- rows (user_id = auth.uid()). The service role bypasses RLS as
-- usual — it is the only writer of cross-account reassignments and
-- the only reader when sending (push_tokens of the ORDER'S owner,
-- looked up from the admin status / handover routes).
--
-- APPLICATION ORDER: run this BEFORE deploying the Delta 2 code —
-- POST /api/push/register writes push_tokens and the notify hook
-- reads them. Until it is applied, both degrade gracefully (the
-- route answers 500, the sender logs and sends nothing).
-- Idempotent: safe to run more than once in the Supabase SQL editor.
-- ═══════════════════════════════════════════════════════════════════

-- ─── 1 · push_tokens table ──────────────────────────────────────────
create table if not exists public.push_tokens (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles (id) on delete cascade,
  expo_push_token text not null unique,
  platform        text not null check (platform in ('android', 'ios', 'web')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists push_tokens_user_id_idx
  on public.push_tokens (user_id);

alter table public.push_tokens enable row level security;

-- Owner-only access. (drop-then-create keeps the file re-runnable.)
drop policy if exists "push_tokens: select own" on public.push_tokens;
create policy "push_tokens: select own"
  on public.push_tokens for select
  using (user_id = auth.uid());

drop policy if exists "push_tokens: insert own" on public.push_tokens;
create policy "push_tokens: insert own"
  on public.push_tokens for insert
  with check (user_id = auth.uid());

drop policy if exists "push_tokens: update own" on public.push_tokens;
create policy "push_tokens: update own"
  on public.push_tokens for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "push_tokens: delete own" on public.push_tokens;
create policy "push_tokens: delete own"
  on public.push_tokens for delete
  using (user_id = auth.uid());
