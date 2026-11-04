# Z-clean

Laundry & dry-cleaning service with doorstep pickup and delivery: public
website, customer accounts, online ordering, Razorpay + Pay on Delivery,
live order tracking and an admin panel.

Built to the spec in `../ARCHITECTURE.md`. This repository contains
**Phases 1–4 plus Phase 5a** — the foundation, catalogue/pricing,
pickup scheduling, the customer dashboard, ordering with Razorpay +
Pay on Delivery, the customer tracking timeline, the admin panel, and
the payment-retry endpoint. The rest of Phase 5 (live Supabase, live
Razorpay keys, production deployment) is still to come — see
`../QA_REPORT.md` for the QA results and the remaining checklist.

## Phase 1 — what's included

- Public pages following a services-led flow: Home (hero, trust points,
  services preview, 4-step How It Works, 6-stage garment-care process, CTA),
  `/services`, `/services/[slug]`, `/pricing`, `/process`, `/about`,
  `/faq`, `/contact` — all with original Z-clean copy.
- Services catalogue in `src/lib/services.ts` (typed) mirrored by the
  database seed in `supabase/schema.sql`.
- Supabase schema with Row Level Security: profiles, addresses, services,
  price_items, service_areas, orders (payment method razorpay | cod),
  order_items, payments, order_status_history, coupons, settings.
  All money is integer paise.
- Auth scaffolding: Supabase browser + server clients, session-refresh
  middleware, validated `/login` and `/register` forms wired to Supabase
  Auth, a sign-out route, and a server-protected `/dashboard`
  (unauthenticated visitors are redirected to `/login`). No mock login.

## Phase 2 — what's included

- **Pricing** in `src/lib/pricing.ts` (single typed source, mirrored by
  `supabase/seed_demo.sql`), drafted from published Indian market ranges
  for Bokaro Steel City — see `../PRICE_LIST_DRAFT.md`. Approved by the
  owner on 2026-11-04 (Phase 3); `/pricing` shows it as the approved
  Bokaro Steel City price list.
- **Demo seed** `supabase/seed_demo.sql` (run after `schema.sql`): services
  with turnarounds, all draft `price_items` in integer paise, Bokaro Steel
  City `service_areas` (pincodes 827001/827003/827004/827006/827009/827013,
  verified against India Post listings), demo settings (incl. demo phone
  +91244567889) and a **DEMO** first-order coupon `FIRST20` (20% off,
  first order only).
- **Schedule Pickup** (`/schedule-pickup`): zod-validated form (shared
  client + server schema), pincode gated against the serviceable list —
  out-of-area pincodes get a clear "not serviceable yet" message.
  `POST /api/pickups` inserts into `pickup_requests` when Supabase is
  configured; otherwise it returns demo mode and the browser stores the
  request in localStorage under a **DEMO MODE** banner with a demo
  reference. A save is never silently faked.
- **Customer dashboard** (`/dashboard`): shows the user's pickup requests
  and lets them add a validated address (`POST /api/addresses`, RLS-owned).
  Without Supabase (or a sign-in) the dashboard renders in labelled DEMO
  MODE using the same localStorage store instead of redirecting away.

## Phase 3 — orders & payment

- **Approved price list.** The market-researched draft in
  `../PRICE_LIST_DRAFT.md` was **approved by the owner on 2026-11-04**;
  `/pricing` now shows it as Z-clean's Bokaro Steel City price list (no
  more "demo price list" banner). `src/lib/pricing.ts` remains the
  offline fallback; the DB (`price_items`) is the source of truth when
  Supabase is connected.
- **Shared totals engine** (`src/lib/totals.ts`) — one module used by the
  browser preview AND the server: express = 1.5× unit prices, `FIRST20` =
  20% off subtotal (first order only), free delivery at ₹299 after
  discount (else ₹40), minimum order ₹199 (pre-discount). All integer
  paise. Test it with `npm run test:totals` (plain-node assertions, 32
  checks incl. the ₹299 boundary and min-order rejection).
- **Order builder** (`/order`): item quantities (fractional for kg / sq
  ft), Regular/Express toggle, live totals preview, pickup details,
  coupon, and payment method — **Razorpay** or **Pay on Delivery**.
- **`POST /api/orders`** validates with zod, re-checks pincode
  serviceability, **re-calculates totals server-side and rejects
  mismatches with 409** — client totals are never trusted. With Supabase
  it inserts order + items + first status-history row (sign-in required):
  COD → `payment_status=cod_pending`, status `PICKUP_SCHEDULED`;
  Razorpay → creates a Razorpay order server-side (test keys) plus a
  `payments` row (`created`) and returns the gateway order id for
  Checkout. Without Supabase it answers `503 { mode: "demo" }` after the
  same validation, and the browser stores the order in the demo store.
- **Razorpay Checkout** opens with the server-created order. The browser
  callback NEVER marks an order paid: **`POST /api/payments/webhook`**
  verifies the `x-razorpay-signature` HMAC-SHA256 over the raw body with
  `RAZORPAY_WEBHOOK_SECRET` and is the only path that sets
  `payments.status = paid` / `orders.payment_status = paid` (and the
  reverse on `payment.failed`). Point the Razorpay dashboard webhook at
  `/api/payments/webhook` with events `payment.captured` +
  `payment.failed`. If Razorpay keys are absent, the demo checkout offers
  explicit **"Simulate payment success / failure"** actions — always
  labelled DEMO MODE, never presented as real payments.
- **Customer views:** the dashboard lists orders; `/orders/[id]` shows
  items, the totals breakdown, payment method/status, the current status
  badge and pickup details. (The visual tracking timeline is Phase 4.)

## Phase 4 — tracking timeline & admin panel

- **Status rules live in one module** (`src/lib/order-flow.ts`): the
  canonical path `PLACED → PICKUP_SCHEDULED → PICKED_UP → RECEIVED →
  IN_PROCESS → READY → OUT_FOR_DELIVERY → DELIVERED`, forward one step
  at a time (no skips, no backwards), `CANCELLED` only from `PLACED` /
  `PICKUP_SCHEDULED`, `DELIVERED`/`CANCELLED` terminal. Payment states
  (`PAYMENT_PENDING`, `PAYMENT_FAILED`, `REFUNDED`) are side-states, not
  timeline steps — money moves via the webhook / COD collection only.
  Test with `npm run test:flow`.
- **Customer timeline** on `/orders/[id]`: a vertical tracker over the
  canonical steps. Completed steps show the timestamp and note from the
  order's status history; the current step is highlighted; cancelled
  orders show a cancelled panel instead.
- **Admin panel** (`/admin`, `/admin/orders/[id]`):
  - *Live mode:* you must be signed in with `profiles.role = 'admin'`
    (see Setup step 3 below for the SQL). Signed-in non-admins get a 403
    screen; signed-out visitors are redirected to `/login`. The role is
    re-checked on the server for every page and API call — never only
    in the browser.
  - *Demo mode (no Supabase configured):* `/admin` is open, but sits
    under a prominent **DEMO MODE** banner and manages only this
    browser's demo orders/pickup requests. Status changes made here
    appear on the demo customer's timeline in the same browser, so the
    full admin → customer loop can be tried without a database.
  - The queue (`GET /api/admin/orders`) lists all orders (admin RLS)
    plus Phase 2 pickup requests, with filters for status, payment
    method and payment status, and search over order id / name / phone.
  - Status updates go through `PATCH /api/admin/orders/[id]/status`,
    which validates the transition with the same `order-flow.ts` rules
    (illegal moves → `422 INVALID_TRANSITION` with the allowed list),
    writes the order + `order_status_history` rows (actor = the admin)
    in one request, and fires the notification hook.
  - **Pay on Delivery:** the order page has a “Mark COD collected”
    action (enabled only while `payment_status = cod_pending`) that
    sets `payment_status = paid` with an audit history row; collection
    can also be recorded in the same update that marks the order
    Delivered — offered as a checkbox, never forced.
- **Notifications:** `src/lib/notify.ts` is called once per status
  change. The only provider today logs to the server console and sends
  nothing — WhatsApp/email providers are a documented TODO behind the
  same interface (`NOTIFY_PROVIDER`). No message is ever fake-sent.

## Phase 5a — payment retry & Razorpay payment link

- **Payment retry** (`POST /api/orders/[id]/retry-payment`): a customer
  whose Razorpay checkout was dismissed or failed no longer has to wait
  for a phone call. The endpoint is owner-only, re-checks eligibility
  with the shared rules in `src/lib/payment-retry.ts` (Razorpay orders
  with `payment_status` pending/failed in `PAYMENT_PENDING` /
  `PAYMENT_FAILED` only — COD and already-paid orders get 422), creates
  a NEW Razorpay gateway order for the same server-side total, closes
  any abandoned earlier `created` attempt as `failed` (the payments
  enum has no "superseded" value; superseded rows keep
  `gateway_payment_id = null`), inserts the new `payments` row, and
  resets the order to awaiting-payment so the verified webhook's
  guarded updates accept the new attempt. The webhook remains the only
  path that marks an order paid. Test the rules with
  `npm run test:retry`. In demo mode the endpoint answers the usual
  `503 { mode: "demo" }` and the order page re-uses its labelled
  simulation actions under a "Retry payment" heading.
- **Razorpay account/gateway setup is DEFERRED** (owner decision,
  2026-11-04). The Checkout.js + webhook integration above stays built
  and dormant until the owner creates the Razorpay account and provides
  test/live keys. Until then, online payment runs through a **Razorpay
  Payment Link** the owner creates in the Razorpay dashboard:
  - Set it via `NEXT_PUBLIC_RAZORPAY_PAYMENT_LINK` (see `.env.example`),
    or paste it into `razorpayPaymentLink` in `src/lib/config.ts` — the
    env var takes precedence.
  - When a link is set, the order builder's payment section and unpaid
    Razorpay order pages show a **“Pay online with Razorpay”** button
    (opens the link in a new tab). Payment-link payments are reconciled
    by the team against the order reference; they do NOT flow through
    the webhook, so the order status updates when staff confirm them.
  - When it is empty, those places show a disabled **“Online payment —
    setting up soon”** stand-in instead. **Pay on Delivery stays fully
    available either way.**

## Phase 7a — organisation foundation (Requirements v2)

The first slice of the full laundry-management plan in
`../REQUIREMENTS_V2.md`: the organisation the rest of the system hangs
off — branches/plants, employees at every workflow stage, and an audit
log. Gift vouchers (Phase 7b), QR/OTP handovers (Phase 8) and finance
(Phase 9) build on these tables.

- **Migration `supabase/schema_v2.sql`** (additive — run it in the SQL
  editor AFTER `schema.sql` and `seed_demo.sql`; it never touches the
  v1 tables):
  - `branches` — name, `type` (`plant` | `collection_center` |
    `branch`), address/area/pincode, `manager_employee_id`, active flag.
  - `employees` — unique `employee_code`, name, phone, optional email,
    optional linked login (`user_id` → `profiles`), branch, reporting
    manager (`manager_id` → `employees`), `employment_status`
    (active/inactive), joining date.
  - `employee_roles` — one row per (employee, role); the role is
    check-constrained to the 12 staff roles, so an employee can hold
    several roles.
  - `audit_logs` — append-only: actor, action, entity, entity id and a
    JSON change diff. RLS lets authenticated users insert only their
    own rows, only admins can read, and there are no update/delete
    policies at all.
  - RLS is admin-only (`is_admin()`) on branches/employees/roles.
- **Permission matrix as data** (`src/lib/org.ts`): the 12 staff roles
  (Collection Center, Picker, Inbound Transporter, Plant Manager,
  Washerman, Ironing Staff, Quality Checker, Packer, Outbound
  Transporter, Home Delivery Staff, Cashier/Accountant, Branch
  Manager), each with its workflow stage and allowed actions — the
  same list the database enforces. Also holds the branch types, the
  employee/branch form validators, the `ZC-EMP-0001`-style code
  generator, and the clearly-marked demo seed (2 units, 3 staff).
  Employees are operational records: a login is optional and linked,
  and staff access comes from the employee record — never from the
  customer/admin `profiles.role`.
- **APIs** (admin-gated exactly like the Phase 4 routes; zod-validated;
  the established `503 { mode: "demo" }` when Supabase is absent):
  `GET/POST /api/admin/branches`, `PATCH /api/admin/branches/[id]`,
  `GET/POST /api/admin/employees` (responses include `roles[]` and the
  branch name), `PATCH /api/admin/employees/[id]` (sent roles replace
  the set; `employmentStatus` toggles activate/deactivate). Employee
  codes are auto-suggested as the next free `ZC-EMP-nnnn` when not
  provided; a duplicate code gets `409 DUPLICATE_CODE`. **Every live
  mutation writes an `audit_logs` row** via `src/lib/audit.ts`
  (`branch.create`, `employee.update`, `employee.deactivate`, …) with
  a before/after diff; the helper never throws into the caller's flow.
- **Admin UI:** `/admin/branches` and `/admin/employees`, linked from
  the new admin section nav (Order queue · Branches · Employees).
  Branches: cards on mobile, table on desktop, create/edit form with
  manager picker (populated once employees exist) and an active
  toggle. Employees: filters by unit, role and status plus search;
  role chips and status pills; create/edit form with every field from
  the plan — name, employee code (auto-suggested, editable), phone,
  optional email, a note explaining optional login linking, roles
  multi-select checkboxes, unit, reporting manager, joining date and
  employment status — and activate/deactivate actions. 44px touch
  targets throughout, per the Phase 6/B responsive pass.
- **Demo vs live:** without Supabase the two screens run on the
  browser demo org store (localStorage keys `zclean_demo_branches_v1`
  / `zclean_demo_employees_v1`, seeded from `src/lib/org.ts`) under
  the usual DEMO MODE banner. In live mode everything above reads and
  writes the new tables under admin RLS.
- Test the matrix, validators and code generator with
  `npm run test:org`.
- **What's next:** Phase 7b — gift vouchers (prepaid card vs promo)
  plus pricing/settings editors.

## Phase 7b — gift vouchers + pricing & settings editors (Requirements v2)

The commercial instruments and the owner-editable catalogue/settings,
per `../REQUIREMENTS_V2.md` §3/§4. Prepaid gift cards and promo
vouchers are different instruments and are never treated as the same
thing anywhere in the system.

- **Migration `supabase/schema_v3.sql`** (additive, idempotent-guarded —
  run it in the SQL editor AFTER `schema_v2.sql`; it never alters the
  v1/v2 tables beyond the noted order columns):
  - `gift_vouchers` — unique `code`, `kind` (`prepaid_card` | `promo`),
    prepaid face/balance in integer paise (CHECK `balance <= face`),
    promo `discount_type` (`fixed` | `percent`) + `discount_value` +
    optional `max_discount_paise` cap, `min_order_paise`,
    `eligible_services` (empty = all services), optional `branch_id`,
    `usage_limit`/`times_used`, `status` (`created` | `issued` |
    `partially_redeemed` | `redeemed` | `expired` | `cancelled`),
    issued-to name/phone/employee, validity dates. A coherence CHECK
    keeps the two kinds' shapes separate in the database itself. RLS
    is **admin-only** — codes are bearer instruments and are never
    exposed to customer/anon clients.
  - `voucher_transactions` — the append-only voucher ledger (`issue` |
    `redeem` | `adjust` | `cancel` | `expire`, amount, balance-after,
    order link, actor), RLS like `audit_logs`: insert for self, select
    admin, no update/delete.
  - `orders` gains `voucher_code`, `voucher_discount_paise`,
    `voucher_redeemed_paise` — so the identity
    `total = subtotal − coupon discount − voucher discount + delivery fee`
    holds exactly; a prepaid card is a **payment**, never a discount,
    and never enters that identity.
  - `payments` needed no change: the table has no `method` column or
    CHECK — the gateway is a free `gateway text` column, so card
    payments are recorded as `gateway = 'voucher'`, `status = 'paid'`.

- **Prepaid vs promo semantics** (`src/lib/vouchers.ts`, pure +
  unit-tested):
  - **Promo** reduces the order total at checkout (fixed ₹ off, or %
    off the subtotal, rounded to the nearest paise and capped by
    `max_discount_paise` when set; never more than the subtotal). It
    consumes one of its `usage_limit` uses and flips to `redeemed`
    when the limit is reached. Promos are **checkout-only** — the
    cashier route rejects them with a plain explanation.
  - **Prepaid card** pays `min(balance, amount due)`. The balance
    drops, a `payments` row is written, and the card becomes
    `partially_redeemed` or `redeemed`. Whatever it doesn't cover
    stays outstanding (COD stays `cod_pending`; finance/balances are
    Phase 9). Usage limits do not apply to cards — balance governs.
  - Both kinds honour: status must be `issued`/`partially_redeemed`,
    the validity window, the minimum order, eligible services (an
    order containing ANY ineligible service is rejected), and a
    branch restriction whenever the redemption has a branch context.
  - **No stacking: a voucher and a coupon can never be used on the
    same order.** Sending both to `POST /api/orders` is a `422
    VOUCHER_COUPON_CONFLICT`, and the rule is unit-tested at the
    helper + schema level.

- **Checkout integration** (`POST /api/orders`): the client sends an
  optional `voucherCode` but never computes its effect — the existing
  `expectedTotalPaise` integrity check still runs against the **base**
  total first. Only then is the voucher resolved server-side through
  the service-role client and validated against the server-computed
  totals. Promo → `total_paise` is reduced and `voucher_discount_paise`
  recorded. Prepaid → applied as a payment (`voucher_redeemed_paise` +
  payments row); if it covers everything, the order is placed already
  `paid` (either payment method); with Razorpay and a part-covering
  card, the gateway order is created for the **remainder** only. The
  /order form has a voucher field next to the coupon field with an
  honest note — there is deliberately **no client-side voucher
  discount preview**, because only the server can verify a bearer
  code. Both order-detail views (customer and admin) show the voucher
  code, the discount taken, the gift-card amount paid, and the amount
  still outstanding; COD copy asks only for the uncovered remainder.

- **Cashier redemption rule** (admin order detail → "Redeem gift
  card", `POST /api/admin/orders/[id]/redeem-voucher`): prepaid cards
  only. Outstanding is defined precisely from the order row — if
  `payment_status = 'paid'` there is nothing outstanding (422);
  otherwise `outstanding = total_paise − voucher_redeemed_paise`. The
  card pays `min(balance, outstanding)`; `voucher_redeemed_paise`
  grows by that amount and, when the outstanding reaches 0, the
  order's `payment_status` becomes `paid`. The redemption is ledgered
  in `voucher_transactions`, noted on the order timeline, and
  audit-logged.

- **Admin UI** (`/admin/vouchers`, `/admin/pricing`,
  `/admin/settings`; nav gains Vouchers · Pricing · Settings):
  - *Vouchers:* batch create (1–50 codes sharing terms; prepaid face
    value, or promo fixed/% + cap + usage limit; min order, eligible
    services multi-select, branch restriction, validity dates), status
    filter, issue to a named person or an employee, cancel (a
    cancelled card's balance is voided), mark expired, expandable
    per-voucher transaction history, and a QR code of the code (the
    `qrcode` package; the code text is always shown as fallback).
  - *Pricing:* every `price_items` row editable (price ₹, express
    multiplier, active toggle), grouped by service, inactive rows
    included.
  - *Settings:* every seeded settings key editable (`business_phone`,
    `business_whatsapp`, `business_email`, `business_address`,
    `opening_hours`, `first_order_offer_note`, and the two paise
    thresholds edited in ₹). The API rejects unknown keys with 422 —
    the editor can only change configuration that exists.
  - All mutations are admin-gated, zod-validated and **audit-logged**
    (`voucher.create/issue/cancel/expire/redeem`, `pricing.update`,
    `settings.update`). Demo mode runs all three screens on the
    browser demo store under the DEMO MODE banner; cashier redemption
    is live-only (it moves a real balance) and says so in demo mode.

- **DB-first catalogue (the editors are real):** `POST /api/orders`
  already re-priced from the database; the storefront did not — it
  rendered the static mirror in `src/lib/pricing.ts`, so an admin
  price edit would have desynced the pricing page and broken the
  order form's total check. `src/lib/catalogue-server.ts` now loads
  the catalogue DB-first (services + price_items are the truth; the
  static groups provide only presentation — titles, unit notes, item
  order), with the approved static list as fallback when Supabase is
  unconfigured, errors, or is empty. `/pricing` and `/order` are
  `force-dynamic` and consume it; the totals engine's API is unchanged
  and all suites stay green. Known scope note: the two paise settings
  (`free_delivery_threshold_paise`, `minimum_order_paise`) are
  editable in the settings table, but the totals engine still reads
  the approved constants from `src/lib/pricing.ts` — wiring settings
  into the engine is a deliberate later step, flagged here rather
  than hidden.
- **Settings-backed contact details:** `getBusinessSettings()`
  (`src/lib/business-settings.ts`) reads `business_phone` /
  `business_whatsapp` from the settings table with the `config.ts`
  constants as fallback, and is used by exactly the site footer and
  the contact page — so a settings edit changes the site immediately.
- Test the voucher rules with `npm run test:vouchers` (69 checks:
  code format/uniqueness, status + validity + min-order + cap +
  eligible-services + branch + usage-limit matrix, prepaid partial /
  full math, coupon-conflict, checkout/create/redeem schemas).
- **What's next:** Phase 8 — QR/OTP handovers at every stage transfer
  + employee stage queues; Phase 9 — finance (partial payments,
  balances, refunds, daily closing, reconciliation) and reports.

## Setup

```bash
npm install
cp .env.example .env.local   # fill in your Supabase + Razorpay (test) keys
```

1. Create a Supabase project, then run `supabase/schema.sql` in the SQL
   editor. It creates all tables, RLS policies, the signup profile trigger,
   the services seed and empty settings rows. For the demo, also run
   `supabase/seed_demo.sql` (demo prices, areas, settings, coupon).
   For the Phase 7a organisation tables (branches, employees,
   employee_roles, audit_logs), run `supabase/schema_v2.sql` afterwards —
   it is additive and safe to re-run. Then, for Phase 7b (gift_vouchers,
   voucher_transactions, the orders voucher columns), run
   `supabase/schema_v3.sql` — also additive and safe to re-run.
2. In Supabase Auth settings, set the Site URL to your app URL
   (e.g. `http://localhost:3000` in development).
3. To make a user an admin, update their row:
   `update profiles set role = 'admin' where id = '<auth-user-id>';`

## Run

```bash
npm run dev     # http://localhost:3000
npm run build   # production build check
npm start       # serve the production build
```

Without Supabase env vars the public site still renders; the login and
registration pages show a "being set up" notice, and Phase 2 flows
(schedule pickup, dashboard) run in clearly labelled DEMO MODE backed by
browser localStorage.

## Pending business input (NOT hardcoded)

The following are intentionally empty placeholders, owned by the business
and stored in the database — `src/lib/config.ts` only holds clearly marked
empty fallbacks:

| Setting | Where it lives |
| --- | --- |
| Business phone / WhatsApp / email / address / hours | `settings` table |
| Launch cities, areas, pincodes | `service_areas` table |
| Real price list | `price_items` table (paise) |
| First-order offer | `coupons` table + `settings.first_order_offer_note` |

Until they are provided, the pricing page explains that the final price is
confirmed at pickup and the contact page shows a launch notice instead of
invented details.

## Stack

Next.js 15 (App Router) · TypeScript · Tailwind CSS 4 · Supabase
(PostgreSQL + Auth + RLS) · Razorpay (Phase 3, test mode first) · zod
validation.
