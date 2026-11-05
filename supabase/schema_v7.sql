-- ═══════════════════════════════════════════════════════════════════
-- Z-clean schema v7 (Delta 1 — admin extensions, 2026-11-05)
--
-- 1. user_role enum — add the two new admin tiers 'ops_manager' and
--    'super_admin'. The full ladder (levels live in src/lib/roles.ts):
--      customer (0) < ops_manager (1) < admin (2) < super_admin (3).
--    ADD VALUE is idempotent via IF NOT EXISTS. NOTE: Postgres can
--    add an enum value inside a transaction, but the new value may
--    not be USED in the same transaction — this file adds the values
--    in step 1 and only uses them in step 4, which runs as its own
--    statement; if the SQL editor wraps the whole file in one
--    transaction and step 4 fails with "unsafe use of new value",
--    simply run step 4 again on its own.
-- 2. profiles.disabled — the customer kill-switch (Delta 1): a
--    disabled account can still sign in (history/support stay
--    reachable) but POST /api/orders and POST /api/pickups answer
--    403 { error: "ACCOUNT_DISABLED" }.
-- 3. is_admin() — redefined to recognize every admin tier. Every RLS
--    policy in schemas v1–v6 calls this one helper, so NO policy is
--    touched; but the helper must learn the new values, otherwise an
--    ops_manager / super_admin would pass the app-level gate yet be
--    blocked by RLS on every admin table (the admin APIs read through
--    the caller's RLS client by design).
-- 4. Promote the e2e test admin to super_admin so role management
--    has a first owner (idempotent; matched by auth email).
--
-- APPLICATION ORDER: run this BEFORE deploying the Delta 1 code —
-- the new API routes select profiles.disabled and the new enum
-- values. Idempotent: safe to run more than once.
-- ═══════════════════════════════════════════════════════════════════

-- ─── 1 · user_role: add the new tiers ───────────────────────────────
alter type public.user_role add value if not exists 'ops_manager';
alter type public.user_role add value if not exists 'super_admin';

-- ─── 2 · profiles.disabled ──────────────────────────────────────────
alter table public.profiles
  add column if not exists disabled boolean not null default false;

-- ─── 3 · is_admin() recognizes every admin tier ─────────────────────
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and role in ('ops_manager', 'admin', 'super_admin')
  );
$$;

-- ─── 4 · first super_admin: the e2e test admin ──────────────────────
update public.profiles
set role = 'super_admin'
where id = (
  select id from auth.users where email = 'e2e.test@zclean.app'
);
