# Changelog

All notable changes to Z-clean. (This file was started at Delta 1;
earlier history lives in the README's phase sections and the git log.)

## Delta 1 — Admin extensions (2026-11-05)

Requires `supabase/schema_v7.sql` (apply before deploying).

### Added
- **Tiered admin roles** — `ops_manager (1) < admin (2) < super_admin (3)`
  on `profiles.role` (schema_v7 extends the `user_role` enum and
  teaches `public.is_admin()` the new tiers; no RLS policy changed).
  `src/lib/roles.ts` holds the levels and the role-change guard;
  `roleGateError()` in `src/lib/admin.ts` enforces per-route minimums
  (`403 FORBIDDEN_ROLE`).
- **Role management** — `GET /api/admin/users` (admin+, emails merged
  from Supabase Auth) and `PATCH /api/admin/users/[id]` (super_admin
  only; `409 SELF_DEMOTION` / `409 LAST_SUPER_ADMIN` guardrails;
  audit-logged `user.role_change`). Settings gains a Team & Roles
  card (editable for super_admin, read-only for admin).
- **Dashboard charts** — `GET /api/admin/analytics?days=` (IST-day
  orders + ledger revenue series and status breakdown, pure math in
  `src/lib/analytics.ts`), rendered as dependency-free SVG on the
  web dashboard; mobile admin home gains a 7-day summary card.
- **Customer Management** — `GET /api/admin/customers` +
  `GET /api/admin/customers/[id]` (orders count, ledger-consistent
  lifetime spend via the finance engine, addresses, recent orders,
  phone-linked active vouchers) and
  `PATCH /api/admin/customers/[id] { disabled }` (admin+,
  audit-logged). Disabled customers get `403 ACCOUNT_DISABLED` from
  `POST /api/orders` and `POST /api/pickups`; sign-in and history
  remain available. Web `/admin/customers` pages and mobile
  Customers screens included.
- **Admin notifications** — `GET /api/admin/notifications` derives
  the attention list on read (no new tables): pending/stuck refunds,
  per-status stuck orders, failed payments, stale guest pickups,
  expiring vouchers, unclosed cash days (`src/lib/notifications.ts`).
  Web topbar bell with high-severity badge, `/admin/notifications`
  page, and a mobile notifications screen.
- **Tests** — `test:roles` (33), `test:analytics` (22),
  `test:notifications` (36); suite total 488 checks, all green.

### Changed
- Per-route minimums: pricing/settings edits, employees/branches
  writes, expense writes, day closing, refund decisions, voucher
  create/void and customer disable now require the admin tier;
  everything else an admin could do before still works at the
  ops_manager tier. Existing `admin` accounts are unaffected.
- Web admin shell and mobile admin home filter Finance / Reports /
  Pricing / Settings by tier and show the caller's role label.
