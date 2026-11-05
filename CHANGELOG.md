# Changelog

All notable changes to Z-clean. (This file was started at Delta 1;
earlier history lives in the README's phase sections and the git log.)

## Delta 3 — Laundra fidelity pass, real reviews & blog (2026-11-05)

Requires `supabase/schema_v9.sql` (apply before deploying). Design
comparison: `FIDELITY_NOTES.md`.

### Added
- **Reviews system** — `reviews` table (schema_v9: one per order,
  owner + DELIVERED insert policy, approved-only public reads,
  admin moderation). `POST /api/reviews`
  (409 ALREADY_REVIEWED / 422 ORDER_NOT_DELIVERED), public
  `GET /api/reviews/approved` (first name + area only, latest 12),
  admin `GET /api/admin/reviews` + `PATCH`/`DELETE
  /api/admin/reviews/[id]` (admin tier, audit-logged
  review.approve / review.reject / review.delete) and the
  `/admin/reviews` moderation page (nav entry "Reviews").
  `GET /api/orders/[id]` now returns the owner's `review`.
- **Review prompts** — web order page (`ReviewForm`) and mobile
  order screen (`ReviewCard`) on DELIVERED orders, with a
  thank-you state that discloses the moderation step.
- **Homepage Testimonials** — renders approved reviews only;
  **hidden entirely while there are none**. No seed/placeholder
  testimonials exist anywhere.
- **Blog** — `src/content/blog.ts` with three original articles
  (silk & festive wear care; wash & fold vs wash & iron vs dry
  cleaning; monsoon laundry guide), `/blog` + `/blog/[slug]`
  (SSG), homepage blog section, header + footer Blog links.
- **Homepage teasers** — pricing teaser fed by the DB-first
  storefront catalogue, FAQ teaser sharing `src/lib/faqs.ts` with
  the FAQ page, hero trust strip of service facts.
- **Tests** — `test:reviews` (28) and `test:blog` (48, incl. the
  fabricated-claims guard); suite total 602, all green.

### Changed
- Homepage rhythm/scale pass (see FIDELITY_NOTES.md): larger hero
  headline, numbered why-choose-us cards, one section padding and
  heading scale with eyebrows, homepage marked `force-dynamic`.
- Footer: Blog link, opening-hours line (when configured), and an
  "Areas we serve" strip (13 areas with pincodes).
- Header nav: Blog added; desktop gap tightened to fit.

## Delta 2 — Push notifications & in-app support (2026-11-05)

Requires `supabase/schema_v8.sql` (apply before deploying).

### Added
- **Push pipeline (backend)** — `push_tokens` table (schema_v8,
  owner-only RLS, unique token, `user_id` index); `src/lib/push.ts`
  with the Expo sender (100-message chunks, `DeviceNotRegistered`
  pruning, never-throws `{ sent, pruned, errors }` summary) and the
  pure helpers (`isExpoPushToken`, `chunkArray`, `buildPushMessages`,
  `tokensToPrune`, `statusChangePush` — timeline copy + deep-link
  data). `notifyStatusChange` now ALSO pushes to the order's
  customer (owner resolved via the service-role client); the Phase 4
  log line and both call sites are unchanged.
- **Token API** — `POST /api/push/register` (signed-in, cookie or
  Bearer; `422 INVALID_PUSH_TOKEN` for non-Expo tokens; upsert
  reassigns a token that moved accounts on a shared device) and
  `DELETE /api/push/register` (own-row removal for logout /
  preference-off). Minimal `{ ok: true }` responses.
- **Mobile push client** — `expo-notifications` + `expo-device`
  (SDK 58), `mobile/src/lib/push.ts`: registration after login /
  session restore, `orders` Android channel, foreground alerts, tap
  deep-link to the tracking screen, graceful `unsupported` on web /
  simulators / Expo Go Android (SDK 53+ removed remote push there).
  "Order updates" toggle on the Account tab (local preference;
  server-side preference storage is a noted follow-up).
- **In-app support** — `BUSINESS` contact constant in
  `mobile/src/lib/config.ts` (demo phone/WhatsApp mirroring the web
  config; email empty → action hidden, as on the web) and a Help &
  Support card (call / WhatsApp / email / FAQs) on the Account tab
  and the order tracking screen, with the order reference
  pre-filled from an order.
- **Tests** — `scripts/test-push.mjs` (38 checks: token validation,
  chunking, message building, pruning decisions, status copy),
  wired into `npm test`.

### Owner-gated (no code change needed when ready)
- Android delivery needs an FCM V1 service-account key in EAS;
  iOS delivery needs APNs via the Apple Developer account.

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
