-- ═══════════════════════════════════════════════════════════════════
-- Z-clean schema v10 (Staff Web App + live tracking, 2026-11-05)
--
-- 1. user_role: add 'staff' — the rider/field identity for the staff
--    web app (/staff). CRITICAL: public.is_admin() is deliberately
--    NOT updated. A staff account must never pass an admin gate; all
--    staff powers come from order_assignments rows (see below) and
--    are checked in the API layer (src/lib/tracking.ts).
-- 2. order_assignments — who is working an order's pickup / delivery
--    leg. A partial unique index keeps exactly ONE active assignment
--    per (order, leg); reassigning completes the old row and inserts
--    a new one, so the table doubles as the assignment history.
--    completed_at is set by the leg's handover (or an admin override).
-- 3. rider_locations — append-only GPS pings for an assignment,
--    written ONLY by POST /api/tracking/ping through the service
--    role after the assignment check. RLS grants reads to the order's
--    owner, admin tiers, and the rider themselves; there are NO
--    insert/update/delete policies, so no client can write directly.
-- 4. addresses.lat/lng + branches.lat/lng — the geocode cache and
--    the facility pin. NOTE: addresses also carries legacy, unused
--    latitude/longitude columns from schema.sql; lat/lng are the
--    canonical pair from this version on (the tracking endpoint
--    falls back to the legacy pair when lat/lng are null).
-- 5. Realtime: rider_locations joins the supabase_realtime
--    publication (guarded — safe when the table is already a member
--    or the publication does not exist).
--
-- APPLICATION ORDER: run BEFORE deploying the Staff Web App code —
-- the staff routes read/write these tables and the 'staff' enum
-- value. Idempotent: safe to run more than once. (The enum value is
-- added in its own statement and never used in this file, per the
-- Postgres same-transaction enum rule.)
-- ═══════════════════════════════════════════════════════════════════

-- ─── 1 · user_role: add the staff identity (NOT an admin tier) ─────
alter type public.user_role add value if not exists 'staff';

-- ─── 2 · order_assignments ──────────────────────────────────────────
create table if not exists public.order_assignments (
  id           uuid primary key default gen_random_uuid(),
  order_id     uuid not null references public.orders (id) on delete cascade,
  leg          text not null check (leg in ('pickup', 'delivery')),
  employee_id  uuid not null references public.employees (id) on delete restrict,
  assigned_by  uuid references public.profiles (id) on delete set null,
  assigned_at  timestamptz not null default now(),
  completed_at timestamptz
);

-- Exactly one ACTIVE assignment per (order, leg).
create unique index if not exists order_assignments_one_active_idx
  on public.order_assignments (order_id, leg)
  where completed_at is null;

create index if not exists order_assignments_employee_active_idx
  on public.order_assignments (employee_id)
  where completed_at is null;

create index if not exists order_assignments_order_idx
  on public.order_assignments (order_id, assigned_at desc);

alter table public.order_assignments enable row level security;

-- Admins manage assignments (the admin APIs read through is_admin()).
drop policy if exists "order_assignments: admin all" on public.order_assignments;
create policy "order_assignments: admin all"
  on public.order_assignments for all
  using (public.is_admin())
  with check (public.is_admin());

-- Staff read their own assignments (their employee record is the one
-- whose user_id is the caller). Writes happen through the APIs.
drop policy if exists "order_assignments: staff select own" on public.order_assignments;
create policy "order_assignments: staff select own"
  on public.order_assignments for select
  using (
    exists (
      select 1 from public.employees e
      where e.id = employee_id and e.user_id = auth.uid()
    )
  );

-- ─── 3 · rider_locations (API-insert only) ──────────────────────────
create table if not exists public.rider_locations (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null references public.orders (id) on delete cascade,
  assignment_id uuid not null references public.order_assignments (id) on delete cascade,
  employee_id   uuid not null references public.employees (id) on delete cascade,
  lat           numeric(9, 6) not null,
  lng           numeric(9, 6) not null,
  accuracy_m    numeric,
  recorded_at   timestamptz not null default now()
);

create index if not exists rider_locations_order_recorded_idx
  on public.rider_locations (order_id, recorded_at desc);

create index if not exists rider_locations_assignment_idx
  on public.rider_locations (assignment_id, recorded_at desc);

alter table public.rider_locations enable row level security;

-- Reads: the order's owner, any admin tier, or the rider themselves.
-- NO insert/update/delete policies on purpose: the only writer is
-- POST /api/tracking/ping via the service role, after the pure
-- assignment check in src/lib/tracking.ts (canPingAssignment).
drop policy if exists "rider_locations: select owner admin or rider" on public.rider_locations;
create policy "rider_locations: select owner admin or rider"
  on public.rider_locations for select
  using (
    public.is_admin()
    or exists (
      select 1 from public.orders o
      where o.id = order_id and o.user_id = auth.uid()
    )
    or exists (
      select 1 from public.employees e
      where e.id = employee_id and e.user_id = auth.uid()
    )
  );

-- ─── 4 · coordinate columns ─────────────────────────────────────────
alter table public.addresses
  add column if not exists lat numeric(9, 6);
alter table public.addresses
  add column if not exists lng numeric(9, 6);

alter table public.branches
  add column if not exists lat numeric(9, 6);
alter table public.branches
  add column if not exists lng numeric(9, 6);

-- ─── 5 · realtime publication ───────────────────────────────────────
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'rider_locations'
    )
  then
    execute 'alter publication supabase_realtime add table public.rider_locations';
  end if;
end $$;
