# Changelog

All notable changes to Z-clean. (This file was started at Delta 1;
earlier history lives in the README's phase sections and the git log.)

## Phase D — customer live tracking map (2026-11-05)

The customer order page becomes a real tracking experience, fed
only by positions a rider's phone actually reported.

### Added
- **Live tracking card** (`src/components/LiveTrackingCard.tsx` +
  `LiveTrackingMap.tsx`) on `/orders/[id]` in live mode. It renders
  ONLY while a leg is genuinely live (active assignment + matching
  order status) — no rider assigned means no card and no fake map.
  Honest *waiting* state before the first ping; *stale* state
  (last-seen position, "updates paused") once a ping is 3 minutes
  old.
- **Leaflet + OpenStreetMap map** (new dependency `leaflet`
  ^1.9.4, `@types/leaflet` dev): rider pin on the last real ping
  (never interpolated), destination pin when the address
  geocoded, facility pin when a branch has coordinates, and the
  OSRM route line for the rider's current position.
- **Live updates**: Supabase Realtime inserts on
  `rider_locations` (RLS-scoped) merged with a 20 s poll of
  `GET /api/tracking/[orderId]` — newer `recordedAt` always wins.
- **Chips**: haversine distance (both points or hidden), OSRM
  "Estimated arrival" (OSRM answer or hidden), "Updated … ago"
  ticking from the real ping timestamp.
- **12-stage presentation timeline**: `OrderTimeline` gains an
  opt-in `presentation` prop (admin usage unchanged) rendering
  Order placed → Pickup scheduled → Rider on the way → Picked up
  → Received at facility → Washing → Drying → Ironing → Quality
  check → Packed → Out for delivery → Delivered, derived from the
  canonical status, pickup-assignment activity, and the order's
  plant handover milestones (`src/lib/tracking-view.ts`).
  Documented derivation: drying shares the plant's single
  Processing handover with washing (no separate drying record
  exists), so it completes at that real event and never shows as
  the current stage alone.

### Tests
- New suite `scripts/test-tracking-view.mjs` (`test:tracking-view`,
  wired into `npm test`): 121 assertions over the card state
  machine, position merging, realtime-row parsing, chip hide
  rules and formatting, OSRM parsing, and the 12-stage
  derivation. Leaflet rendering itself is not unit-tested
  (DOM/canvas) — the pure decisions behind it are. Full suite:
  838 passed, 0 failed; `next build` green.

## Link-session fix: staff invite / password reset landings (2026-11-05)

Fixed a live bug: a staff invite link verified successfully at
Supabase yet `/staff/set-password` showed "This invite link is not
valid", and reopening the email link reported `otp_expired`.

Root cause: GoTrue redirects verified email links back with
implicit-flow tokens in the URL fragment, but the @supabase/ssr
browser client is pinned to `flowType: "pkce"` and auth-js refuses
implicit callbacks ("Not a valid PKCE flow url.") — so the session
never reached `getSession()`/`onAuthStateChange`, while the
single-use token was already consumed. Both landing pages only
waited on the client and timed out into the invalid state.

### Fixed
- **Emailed-link pages resolve the fragment themselves** — new
  pure helper `src/lib/link-session.ts`
  (`parseLinkHash`/`resolveLinkSession`), used by both
  `/staff/set-password` and `/reset-password` (the latter shared
  the flaw for implicit-flow links, e.g. resets sent by the
  service-role admin client): existing session → form; fragment
  tokens → `auth.setSession()` (fragment stripped from the URL
  afterwards); error fragment → invalid state immediately;
  nothing usable → invalid after a grace period.
- **Invite endpoint resend path** — `POST
  /api/admin/employees/[id]/invite` for an already-linked employee
  now sends a password-recovery email via the service-role client
  (`resetPasswordForEmail`, redirect to `/staff/set-password`) and
  returns state `reset_sent`, audit-logged like the invite;
  `already_linked` remains only when no email exists for the
  linked account. Employees UI: linked staff gain a **Send
  password-set link** button (the endpoint's message is shown as
  feedback, as before).

### Tests
- New `scripts/test-link-session.mjs` (`npm run
  test:link-session`, wired into `npm test`): 16 checks over the
  resolver — session → ready, tokens → set-session (incl. decoding),
  error fragment → invalid (incl. precedence over a session),
  partial/absent tokens → invalid, parser shape.

## Staff Web App + live tracking backend (2026-11-05)

Schema: `supabase/schema_v10.sql` (written, applied separately).
Spec: `STAFF_APP_SPEC.md`. README section: "Staff Web App + live
tracking backend". Tests: 701 passed, 0 failed (602 baseline + 99
new in `scripts/test-tracking.mjs`).

### Added
- **Staff role** — `profiles.role` gains `'staff'`. It is NOT an
  admin tier: `is_admin()` untouched, admin gate still rejects it;
  all staff power derives from assignments.
- **`/staff` web app** (mobile-first, pastel tool shell) — "My
  rounds" list (own active assignments only; admin tiers get a
  read-only support view), round detail with address, Google Maps
  Navigate deep link, call-customer, COD-due banner, a Share
  Location panel (Geolocation `watchPosition`, 15 s / 25 m
  throttle + 2-min heartbeat, Wake Lock attempt, plain-language
  permission states, explicit "keep this tab open" copy), and an
  OTP handover panel with done states. `/staff/set-password` is
  the invite landing page (reset-password machinery; sits outside
  the gated staff shell by design — invite sessions arrive in the
  URL hash). **Setup:** add the URL to the Supabase Auth redirect
  allowlist.
- **Invite lifecycle** — `POST /api/admin/employees/[id]/invite`
  (admin tier): `inviteUserByEmail` via the service role → links
  `employees.user_id` + sets `profiles.role='staff'`, audit-logged.
  Honest states: no email on file (422 `NO_EMAIL`), already linked
  (no-op), email already has an account (that account is linked
  instead, and the UI says so). "Invite to staff app" button on
  Employees with linked / needs-email states.
- **Assignments** — `order_assignments` (one ACTIVE per order+leg,
  partial unique index). `GET/POST/PATCH
  /api/admin/orders/[id]/assignments` (view: any admin tier;
  assign/reassign/close: ops_manager+). Eligibility is the leg's
  handover-chain role on an active employee (`canAssignEmployee`).
  Rider assignments card on the admin order detail.
- **Tracking APIs** — `GET /api/staff/tasks` (assignment-scoped),
  `POST /api/tracking/ping` (assignment-checked via
  `canPingAssignment`, rate-limited 12/min/user, service-role
  insert — `rider_locations` has no client write policy),
  `POST /api/staff/tasks/[assignmentId]/handover`,
  `GET /api/tracking/[orderId]` (owner-or-admin feed for the
  Phase D customer map). `rider_locations` joins the
  `supabase_realtime` publication.
- **Geocoding** — fire-and-forget Nominatim on address create and
  order placement; pins cached on `addresses.lat/lng`; failures
  silent-null, never block the write.
- **Branch facility pin** — `branches.lat/lng`, editable in the
  Branches admin form/API; feeds the tracking endpoint's facility
  coordinates.
- **Pure lib** `src/lib/tracking.ts` — leg mapping, assignment
  rules, ping predicate, coordinate/accuracy validation, haversine
  + ETA (Phase D), send throttle, geocode shaping.

### Changed
- **Shared handover flow** — the admin handover route's engine was
  extracted verbatim into `src/lib/handovers-server.ts`
  (`completeHandover`); the admin route is now a thin wrapper with
  identical behaviour, and the staff handover route runs the same
  flow (assignment-scoped, service role) instead of forking the
  state machine.
- **SiteChrome** — storefront header/footer skipped under `/staff`
  (except the invite landing page, which keeps the familiar frame).

### Notes
- Location sharing is **foreground-only** by platform reality; the
  UI states this plainly and never claims background tracking.
- The legacy unused `addresses.latitude/longitude` columns remain;
  reads prefer `lat/lng` and fall back to them.

## Phase A — Premium website redesign (CleanPro language) (2026-11-05)

Design comparison: `FIDELITY_NOTES.md` (Phase A section). Web only —
no schema, API, data or behaviour changes; admin and mobile untouched.

### Added
- **Design system** — pastel `mist` scale + navy aliases, soft
  shadow scale (`shadow-soft*`), `.bg-pastel-hero` / `.bg-pastel-band`
  gradients, `.glass-panel`, and reduced-motion-safe `.zc-float`
  levitation animations in `globals.css`. Brand teal remains the
  action accent.
- **`/app` page** — Android card links to the project's Expo builds
  page; iOS card honestly states the App Store release is in
  preparation and routes to the web app.
- **`HeroVisual`** — floating garment composition (levitating main
  photo, overlapping handover card, two honest annotation chips).
- **`HomeServices`** — homepage services grid fed by the live
  catalogue, showing "From ₹X" per service.

### Changed
- **Header** — glassy sticky bar; Services dropdown with all 8
  services; Pricing / Blog / Track / Help nav; "Get the App" pill.
- **Homepage** — owner's headline "The New Level of Care for Your
  Wardrobe", dual CTA (Schedule a Pickup / Track Your Order), glass
  trust-fact cards; every section restyled to floating
  `rounded-[2rem]` cards on pastel bands. `HeroSlider` removed.
- **ServiceCard / BlogCard** — floating garment cards with a coloured
  corner tab and hover lift; services without a photo get a gradient
  initial band.
- **Dashboard + orders list** — floating action/panel cards; order
  cards rebuilt in the garment-card shape with real quantities,
  dates, references and totals (existing APIs only).
- **Order detail, pricing, services index/detail** — chrome-only
  restyles (floating cards, pastel hero panels); timeline, QR/OTP,
  payments, review form and all data flows byte-identical.
- **Footer** — mist palette, soft-shadow area chips, "Get the app"
  link.

### Integrity
- No ratings, avatar clusters, customer/review counts or guarantees
  were added — the references' social proof is fabricated by design
  and stays out. Trust elements remain computed service facts.

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
