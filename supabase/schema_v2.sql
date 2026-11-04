-- ============================================================================
-- Z-clean — Supabase / PostgreSQL schema v2 (Phase 7a: organisation
-- foundation — Requirements v2 §3).
--
-- ADDITIVE migration: run AFTER supabase/schema.sql (and seed_demo.sql) in
-- the Supabase SQL editor. It never alters the v1 tables; it only adds the
-- organisation tables: branches, employees, employee_roles, audit_logs.
--
-- Employees are OPERATIONAL records. A login is optional and linked via
-- employees.user_id -> profiles(id); staff roles live in employee_roles and
-- are completely separate from the customer/admin profiles.role.
--
-- Row Level Security is enabled on every new table:
--   * branches / employees / employee_roles: admins (is_admin()) only.
--   * audit_logs: append-only — authenticated users may INSERT rows about
--     themselves (actor_user_id = auth.uid()), only admins may read, and
--     there are deliberately NO update/delete policies.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- Enums (idempotent DO + duplicate_object guard, same style as schema.sql)
-- ----------------------------------------------------------------------------
do $$ begin
  create type public.branch_type as enum ('plant', 'collection_center', 'branch');
exception when duplicate_object then null; end $$;

-- ----------------------------------------------------------------------------
-- branches — plants, collection centers and branches. Created WITHOUT the
-- manager FK first: branches.manager_employee_id points at employees, and
-- employees.branch_id points back at branches. The FK is added by ALTER
-- once employees exists (below).
-- ----------------------------------------------------------------------------
create table if not exists public.branches (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type public.branch_type not null,
  address text,
  area text,
  pincode text,
  manager_employee_id uuid,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists branches_type_idx on public.branches (type);

-- ----------------------------------------------------------------------------
-- employees — one operational record per staff member. Multi-role lives in
-- employee_roles (below); an employee may hold several roles when the
-- admin authorises it.
-- ----------------------------------------------------------------------------
create table if not exists public.employees (
  id uuid primary key default gen_random_uuid(),
  employee_code text not null unique,
  full_name text not null,
  phone text not null,
  email text,
  user_id uuid references public.profiles (id) on delete set null,
  branch_id uuid references public.branches (id) on delete set null,
  manager_id uuid references public.employees (id) on delete set null,
  employment_status text not null default 'active'
    check (employment_status in ('active', 'inactive')),
  joining_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists employees_branch_id_idx on public.employees (branch_id);
create index if not exists employees_manager_id_idx on public.employees (manager_id);
create index if not exists employees_user_id_idx on public.employees (user_id);

-- branches.manager_employee_id -> employees.id (deferred until employees
-- exists; guarded so the migration can be re-run safely).
alter table public.branches
  add column if not exists manager_employee_id uuid;
do $$ begin
  alter table public.branches
    add constraint branches_manager_employee_id_fk
    foreign key (manager_employee_id)
    references public.employees (id) on delete set null;
exception when duplicate_object then null; end $$;
create index if not exists branches_manager_employee_id_idx
  on public.branches (manager_employee_id);

-- ----------------------------------------------------------------------------
-- employee_roles — the 12 staff roles from Requirements v2 §3. One row per
-- (employee, role); the check constraint is the permission-matrix key set
-- mirrored in src/lib/org.ts (STAFF_ROLES).
-- ----------------------------------------------------------------------------
create table if not exists public.employee_roles (
  employee_id uuid not null references public.employees (id) on delete cascade,
  role text not null check (role in (
    'collection_center',
    'picker',
    'transporter_inbound',
    'plant_manager',
    'washerman',
    'ironing_staff',
    'quality_checker',
    'packer',
    'transporter_outbound',
    'delivery_staff',
    'cashier',
    'branch_manager'
  )),
  created_at timestamptz not null default now(),
  primary key (employee_id, role)
);
create index if not exists employee_roles_role_idx on public.employee_roles (role);

-- ----------------------------------------------------------------------------
-- audit_logs — append-only trail for staff/admin mutations (Phase 7a+).
-- actor_user_id is the signed-in account that acted; actor_label keeps a
-- human-readable name even if the account is later removed. details holds
-- the change diff (before/after) as JSON.
-- ----------------------------------------------------------------------------
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references public.profiles (id) on delete set null,
  actor_label text,
  action text not null,
  entity text not null,
  entity_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists audit_logs_entity_idx
  on public.audit_logs (entity, entity_id);
create index if not exists audit_logs_created_at_idx
  on public.audit_logs (created_at);

-- ============================================================================
-- Row Level Security
-- ============================================================================
alter table public.branches       enable row level security;
alter table public.employees      enable row level security;
alter table public.employee_roles enable row level security;
alter table public.audit_logs     enable row level security;

-- branches / employees / employee_roles: admins only (the admin panel is
-- the single management surface; staff-facing reads arrive with the
-- Phase 8 stage queues under their own policies).
drop policy if exists "branches: admin only" on public.branches;
create policy "branches: admin only"
  on public.branches for all
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "employees: admin only" on public.employees;
create policy "employees: admin only"
  on public.employees for all
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "employee_roles: admin only" on public.employee_roles;
create policy "employee_roles: admin only"
  on public.employee_roles for all
  using (public.is_admin())
  with check (public.is_admin());

-- audit_logs: append-only. Any authenticated user may insert a row about
-- their own actions; only admins may read; no update/delete policies are
-- created, so rows can never be edited or removed through the API.
drop policy if exists "audit_logs: insert own" on public.audit_logs;
create policy "audit_logs: insert own"
  on public.audit_logs for insert
  with check (actor_user_id = auth.uid());
drop policy if exists "audit_logs: admin read" on public.audit_logs;
create policy "audit_logs: admin read"
  on public.audit_logs for select
  using (public.is_admin());
