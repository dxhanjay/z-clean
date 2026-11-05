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

## Phase 8 — QR/OTP handovers + stage queues (Requirements v2)

Every custody transfer of an order is now a recorded, verified
handover. The chain is data — `HANDOVER_CHAIN` in
`src/lib/handovers.ts` — and the queues, the order screens and the API
validation all read that one list. Handovers attach to the canonical
lifecycle (Requirements v2 §4): a point may carry a status effect, and
completion is allowed only when that move is legal per
`src/lib/order-flow.ts`. There is no parallel status system and no
current-point column — which point an order awaits is *derived* from
its status plus the handovers already recorded.

- **Migration `supabase/schema_v4.sql`** (additive, idempotent — run
  AFTER `schema_v3.sql`):
  - `orders` gains `qr_token` (unique, unguessable; existing rows are
    backfilled), `pickup_otp`, `pickup_otp_used_at`, `delivery_otp`,
    `delivery_otp_used_at`, and `otp_attempts` — ONE shared counter
    across both OTPs. OTPs of pre-v4 orders stay NULL until an admin
    generates them; the API answers `OTP_NOT_SET`, it never invents a
    code silently.
  - `handovers` — the append-only transfer ledger: order, `point_id`,
    from/to stage labels, `method` (`qr` | `otp`), from/to employee,
    the recording admin account, `quantity` vs `expected_quantity`,
    and `flags` constrained to the plan's vocabulary (`missing_item`,
    `quantity_mismatch`, `duplicate`, `wrong_order`, `unauthorized`,
    `otp_retry`). RLS is admin-only (select + insert; no update/delete
    policies — the ledger cannot be rewritten). Customers never read
    this table directly.

- **The chain (11 points):**

  | # | Point | From → To | Verify | Status effect |
  |---|---|---|---|---|
  | 1 | `pickup` | Customer → Picker | customer pickup OTP | → `PICKED_UP` |
  | 2 | `picker_to_centre` | Picker → Collection Center | QR | — |
  | 3 | `centre_to_plant` | Collection Center / Inbound Transporter → Plant Manager | QR | → `RECEIVED` |
  | 4 | `plant_sorting` | Plant Manager → Washerman (Sorting & Inspection) | QR | → `IN_PROCESS` |
  | 5 | `plant_stain` | Washerman → Washerman (Stain Treatment) | QR | — |
  | 6 | `plant_processing` | Washerman → Ironing Staff (Processing) | QR | — |
  | 7 | `plant_finishing` | Ironing Staff → Quality Checker (Finishing) | QR | — |
  | 8 | `plant_qc` | Quality Checker → Packer (Quality Check) | QR | — |
  | 9 | `plant_packing` | Packer — packing complete | QR | → `READY` |
  | 10 | `packer_to_outbound` | Packer → Outbound Transporter | QR | → `OUT_FOR_DELIVERY` |
  | 11 | `delivery` | Outbound Transporter / Home Delivery Staff → Customer | customer delivery OTP | → `DELIVERED` |

  Points 4–9 are the six care stages inside `IN_PROCESS`. At
  `delivery`, the receiving employee may be Home Delivery Staff or the
  Outbound Transporter. The handover's from-employee is derived
  server-side from the previous point's receiver (at pickup the
  customer hands over, so there is none).

- **Verification rules** (`checkHandover`, one pure function used
  verbatim by the live route AND the demo-mode applier):
  - *Sequence:* the point must be the order's next expected point —
    already-done → `409 DUPLICATE`; anything else →
    `409 OUT_OF_SEQUENCE`. Terminal and payment side-state orders
    await nothing.
  - *Employee:* the selected receiver must exist, be **active**
    (`409 EMPLOYEE_INACTIVE`) and hold the point's role from the
    permission matrix (`422 ROLE_MISMATCH`).
  - *OTP:* 6-digit codes generated per order at creation, shown only
    to the customer on their order page. Wrong code →
    `422 OTP_MISMATCH`, the shared attempts counter increments and
    the failure is audit-logged (failed attempts never create
    handover rows). **Lockout: 5 failed attempts → `423 OTP_LOCKED`**
    for both OTPs until an admin regenerates one
    (`POST /api/admin/orders/[id]/regenerate-otp`, which replaces the
    code, clears its used marker, resets the counter, and is
    audit-logged; the new code is returned once to the admin and is
    visible to the customer on their order page).
  - *QR:* the payload is `zclean:order:<qr_token>` — the unguessable
    token, never the order reference. A scan/paste that doesn't match
    the order's token → `422 QR_MISMATCH` (the wrong-bag guard).
  - *Quantity:* defaults to the order's total item count; a different
    count completes **with** a `quantity_mismatch` flag — the plan's
    rule is flag, don't block. Staff can also flag a missing item.
  - *COD:* the delivery handover accepts `codCollected: true` with
    exactly the admin status route's semantics (COD + still
    `cod_pending`, else `422 COD_NOT_PENDING`); it is rejected at any
    other point. Status effects write the same history rows and fire
    the same notification hook as manual status updates, and every
    completion is audit-logged as `handover.complete`.

- **Staff act from the admin console — honestly.** Employees have no
  separate logins yet (the Phase 7a decision: a login is optional and
  linked, never the source of staff access). So handovers are
  recorded by an admin who *selects the employee physically receiving
  the items*; that employee is validated (role + active) and named on
  the record, while the audit log names the admin account that
  recorded it. The UI copy on both handover screens states this
  plainly. Per-employee logins remain a future step and will reuse
  exactly this validation.

- **Screens:**
  - *Admin order detail → Handover chain:* the order's QR (image +
    payload), OTP states (set / used / attempts / locked — the raw
    codes are the customer's and are never returned by the admin API),
    regenerate buttons when an OTP is missing or locked, the
    completed chain (employee names, times, method, quantities, flags
    highlighted), and the next-point card (role-filtered employee
    select, OTP entry or QR scan/paste field, quantity confirm,
    missing-item flag, COD-collected checkbox at delivery).
  - *Stage Queues* (`/admin/stages`, nav): pick an employee (grouped
    by role) and see their receivable points with counts and the
    orders awaiting each, oldest first, one click into the order's
    handover card. `GET /api/admin/stages?employeeId=` drives it.
  - *Customer order page:* the order QR plus pickup/delivery OTPs —
    each OTP visible only until it is used, only to the signed-in
    owner (the endpoint is RLS-scoped; admin list endpoints never
    include OTPs) — and a simplified handover milestone list (point
    label, role labels, time, quantity, flags). **No employee personal
    names appear in the customer view**: milestones are composed
    server-side from the admin-only handovers table with names and
    ids stripped.
  - *Demo mode:* demo orders get QR tokens + OTPs at creation
    (pre-Phase-8 stored orders are backfilled once, on first read,
    and persisted), handovers live in a localStorage ledger, and the
    demo applier runs the same `checkHandover`. The demo seeds three
    employees; create demo employees with the remaining custody roles
    on the Employees screen to walk the full chain.
- Test the chain rules with `npm run test:handovers` (105 checks:
  chain integrity against `STAFF_ROLES` + `careStages`, effect
  legality against order-flow, next-point walk, OTP generation /
  lockout math, QR round-trip, quantity flags, role matching,
  `checkHandover` scenarios, request schemas).
- **What's next:** Phase 9 — finance (partial payments, balances,
  refunds with approval, daily closing, reconciliation) and reports
  (sales, pending-order aging, employee performance from the handover
  ledger, voucher usage).

## Phase 9 — finance & reports (Requirements v2)

- **Run `supabase/schema_v5.sql`** after schema_v4 (additive, safe to
  re-run). It adds the `payment_entries` staff ledger, the `refunds`
  workflow table, `expenses`, `cash_closings`, and the
  `'partially_paid'` value on the `payment_status` enum (`'refunded'`
  was already there).
- **One money computation** — `src/lib/finance.ts`, used by every API,
  screen, receipt and report:
  - Effective paid = paid rows in the v1 `payments` table (Razorpay
    **and** Phase 7b gift-card rows) + `payment_entries` of type
    'payment'. `orders.voucher_redeemed_paise` mirrors the gift-card
    rows and is **never** added on top — no double counting.
  - **Legacy rule:** orders marked `paid` by the v1 COD-collection
    action (no ledger rows) count as settled in full, flagged
    `legacySettled` so the UI can explain it instead of showing a
    phantom shortfall.
  - Outstanding = total − effective paid. Refunds never reopen the
    bill; refundable = effective − processed refunds − refunds in
    status requested/approved.
  - After any money event the order's `payment_status` is re-derived:
    fully refunded → `refunded`, settled → `paid`, part-paid →
    `partially_paid`.
- **Recording payments** (admin order page → Payments): cash, UPI,
  card machine or bank transfer, part or full, with an optional
  reference and "received by" employee. Overpayment is refused
  (422 OVERPAYMENT); the customer timeline gets a note ("Payment
  received — ₹250 via UPI. Balance ₹140."). All writes audit-logged.
  Note: a part-paid COD order can no longer use the v1 "Mark COD
  collected" shortcut (it requires `cod_pending`) — record the rest
  here instead.
- **Refunds with approval:** request on the order page (amount,
  reason, method) → approve / reject → process. Only processing moves
  money: it writes the ledger refund row (for "original payment
  method" the ledger method follows the money's origin) and re-derives
  the payment status. The Finance screen carries the same queue.
- **Daily closing & reconciliation** (`/admin/finance`): collections
  grouped by method for any IST date, split online/gateway vs recorded
  at the desk; expected cash = ledger cash payments − cash refunds
  (gateway money is never drawer cash); close the day with the counted
  cash and the difference is frozen on the closing record. A date
  closes exactly once. Outstanding-balances list (oldest first) and
  the expenses ledger (add / delete — deletions are audit-logged)
  live on the same screen.
- **Receipts:** `/orders/[id]/receipt`, linked from the customer and
  admin order pages — business details from `settings`, items, totals,
  the full payments breakdown (gift card + every entry), refunds, and
  a PAID / REFUNDED / BALANCE DUE stamp, with print CSS that shows
  only the sheet.
- **Reports** (`/admin/reports`, 7 / 30 / 90 days): sales by day,
  service, area and plant (credited via the centre-to-plant handover's
  receiving plant manager), pending-order aging buckets, employee
  performance from the handover ledger (completions, deliveries, flags
  raised), voucher usage (created / issued / redeemed, outstanding
  gift-card liability, discount given, value redeemed), customer
  retention (repeat rate, top customers), expenses by category and
  sales-vs-expense net. Aggregation lives in `src/lib/reports.ts`;
  empty data shows "No data yet", never an invented number.
- **Demo mode:** finance and reports run on browser demo stores
  (`src/lib/demo-finance.ts`) through the same pure modules; the demo
  stores start empty and only ever show what the demo user recorded.
- Test the money math with `npm run test:finance` (83 checks:
  paid-total rule incl. the voucher no-double-count and legacy cases,
  refundable holds, status decisions, IST day boundaries, expected
  cash, aging buckets, collections, reports aggregation, schemas).

## Requirements v2 — complete

With Phase 9, the build-out from the owner's "Laundry Management
Software — Updated Software Requirement Plan" is complete:

| Plan area | Where it lives |
| --- | --- |
| Customer booking, pickup, tracking | Phases 1–6 (live) |
| Branches / plants / collection centers | Phase 7a (`/admin/branches`) |
| Employees at every stage, 12 roles | Phase 7a (`/admin/employees`, `employee_roles`) |
| Gift vouchers & prepaid cards, audited | Phase 7b (`/admin/vouchers`) |
| Pricing & business settings editors | Phase 7b (`/admin/pricing`, `/admin/settings`) |
| QR/OTP handovers at every transfer | Phase 8 (`/admin/stages`, order QR + OTPs) |
| Payments: partial, advance, balances | Phase 9 (`payment_entries`, order Payments panel) |
| Refunds with approval | Phase 9 (request → approve → process) |
| Receipts | Phase 9 (`/orders/[id]/receipt`) |
| Daily cash closing & reconciliation | Phase 9 (`/admin/finance`) |
| Reports & analytics + expenses | Phase 9 (`/admin/reports`) |
| Audit trail for staff actions | `audit_logs` throughout (7a–9) |

Deliberately still owner-gated, as decided during the build: the live
Razorpay account setup (only the Payment Link slot ships), individual
employee logins (staff act from the admin console, recorded by name),
and the two ₹ settings keys (free-delivery threshold, minimum order)
being wired into the totals engine.

## Mobile — Phase 1 (PWA + Expo app, bearer API auth)

One backend now serves three clients: the web app, an installable
PWA of the same web app, and a native Expo app (Android & iOS) in
`mobile/`.

### Bearer-token API contract

API routes accept EITHER credential — same endpoints, same response
shapes, same status codes:

| Credential | Who | How it is checked |
| --- | --- | --- |
| Supabase session cookie | Web app (browser) | `@supabase/ssr` cookie client, as always |
| `Authorization: Bearer <access-token>` | Mobile app | Token validated with the Supabase Auth server (`auth.getUser(token)`); queries then run through an anon-key client carrying the token, so RLS applies as that user |

Resolution lives in `src/lib/supabase/request-auth.ts`
(`resolveRequestAuth`) and is used by `getAdminGate()` (all admin
routes) and the customer order routes: `POST /api/orders`,
`GET /api/orders`, `GET /api/orders/[id]`, `GET /api/admin/orders`,
`GET /api/admin/orders/[id]`, `PATCH /api/admin/orders/[id]/status`.
The cookie is tried first, so web behaviour is unchanged; an invalid
or missing credential gets the route's usual 401/403. Tokens are
never trusted by decoding alone, and the service-role key plays no
part in request auth.

### PWA

`src/app/manifest.ts` serves `/manifest.webmanifest` (name "Z-clean",
standalone, brand teal `#22786d` theme). Icons: an SVG "Z" on brand
teal (`public/icons/icon.svg`) for install prompts, plus raster PNGs
(192/512/maskable, apple-touch 180) generated — not hand-maintained —
by `node scripts/generate-icons.mjs` (zero-dependency PNG encoder).
Apple web-app meta + theme color are set in `src/app/layout.tsx`.

### Expo app (`mobile/`)

Expo + expo-router + TypeScript. It signs in against the same
Supabase project (publishable key in `app.json` `extra` — public by
design; override via `EXPO_PUBLIC_*` env), persists the session in
AsyncStorage, reads catalogue/areas from the database under the same
public-read RLS the web storefront uses (bundled approved list as
fallback, exactly like the web demo read), places orders through
`POST /api/orders` with the Bearer token (COD + gift-voucher code;
expected total computed by a port of the web totals engine in
`mobile/lib/totals.ts`), and shows order detail with the QR payload,
OTPs, timeline and money breakdown. Admins (profiles.role = 'admin')
get an Admin tab: order queue with status filter, order detail with
valid-next-status actions and Mark COD collected, and a "More admin"
screen that links to the web admin for the sections that are not
in-app yet (handovers and finance arrive in Mobile Phases 2/3).
Ordering requires sign-in — there is no demo mode in the app.

```bash
cd mobile
npm install
npx expo start        # dev server / Expo Go
npx tsc --noEmit      # type check
npx expo export       # production bundle check
```

## Admin console redesign — sidebar shell + dashboard

The admin panel's chrome was rebuilt as a console: a dark slate
sidebar with logo block, the signed-in admin's profile block, grouped
menus (Main · Management · Catalogue & Config · Finance) and a
footer (storefront link, sign out), a slim topbar with the current
section title, and pages on a light panel background with white
cards. On medium screens the sidebar collapses to an icon rail; on
small screens it becomes a slide-over drawer. The layout is inspired
by the Gentelella dashboard design and is an original implementation
in this codebase's Tailwind / React Native stack — no template code
is used. The admin gate (`getAdminGate`) is unchanged: demo banner,
login redirect and the 403 screen behave exactly as before, and the
storefront header/footer no longer wrap admin pages
(`src/components/SiteChrome.tsx`).

- **Dashboard** (`/admin`): four stat tiles (orders today, collected
  today, in progress, outstanding) and three panels (recent orders,
  needs attention — pending refunds and stale pickups — and "today at
  the desk": expected cash plus the gateway-vs-desk split). Every
  number comes from the existing admin APIs (orders, finance
  overview, outstanding, refunds); demo mode computes the same views
  from the demo stores.
- **Route move:** the order queue moved from `/admin` to
  `/admin/orders`; order detail stays at `/admin/orders/[id]`, and
  its back links point at the new queue URL.
- The Expo app's "More admin tools" screen is now an **Admin
  dashboard** with the same slate header block, the same four stat
  tiles and the same grouped menu; the app's admin screens sit on the
  same light panel background with slate stack headers.

## P0 hardening — security, MFA, rate limits, health, CI

A maintenance-pack release (no business-logic changes):

- **Security headers** — every response carries a Content Security
  Policy, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`,
  a strict Referrer-Policy and a Permissions-Policy
  (`next.config.ts`). HSTS comes from Vercel and is not duplicated.
  The CSP keeps `script-src 'unsafe-inline'` because Next.js injects
  inline bootstrap scripts and this app does not use nonces.
- **Health endpoint** — `GET /api/health` (no auth) answers
  `200 { status: "ok", db: true, time }` when the app is up and the
  database answers a trivial probe, else
  `503 { status: "degraded", db: false, time }`. Point uptime
  monitors at it.
- **Password reset** — "Forgot password?" on the web login (and in
  the mobile app) posts to `POST /api/auth/reset`, which ALWAYS
  returns `200 { ok: true }` so account existence can never be
  enumerated. The emailed link lands on `/reset-password`, where the
  browser client picks up the recovery session and the user sets a
  new password via `auth.updateUser`. The redirect URL is built from
  `NEXT_PUBLIC_SITE_URL` when set, else from the request's forwarded
  host headers (`src/lib/site-url.ts`). **Supabase setup:** add
  `<site-url>/reset-password` to Auth → URL Configuration → Redirect
  URLs, or the link will bounce to the Site URL instead.
- **MFA (TOTP) for admins — opt-in rollout, nobody locked out.**
  Enrol in **Admin → Settings → "Admin security — two-factor
  authentication (MFA)"**: scan the QR code (or enter the secret) in
  an authenticator app and confirm with a 6-digit code; the factor
  can be removed from the same card. Once an admin HAS a verified
  factor, the web admin layout steps their session up: an AAL1
  session is redirected to `/auth/mfa` for a code before any admin
  page renders. Admins with NO factor are let in as before, with a
  slim, per-session-dismissible banner reminding them to enable it.
  The mobile app mirrors this at sign-in (code screen after
  password; cancelling signs out; enrolment stays web-only).
  **Scoping, deliberately:** API routes keep the role-only
  `getAdminGate()` in this phase — bearer-token mobile calls do not
  carry an AAL claim the gate could check — so AAL2 is enforced by
  the web admin UI and the mobile sign-in flow, not the API gate.
- **Rate limits** (`src/lib/rate-limit.ts`, counters in
  `supabase/schema_v6.sql`, written by the service role through the
  `rate_limit_hit()` SQL function; the limiter FAILS OPEN on any
  error so it can never block genuine traffic):

  | Endpoint | Key | Limit |
  | --- | --- | --- |
  | `POST /api/pickups` | client IP | 10 / hour → `429 { error: "RATE_LIMITED" }` |
  | `POST /api/orders` | user id (fallback client IP) | 20 / hour → `429` |
  | `POST /api/auth/reset` | client IP | 5 / hour (silently skipped, still 200) |
  | `POST /api/auth/reset` | email address | 3 / hour (silently skipped, still 200) |

- **Bearer parity** — `/api/addresses` and
  `/api/orders/[id]/retry-payment` resolve auth through
  `resolveRequestAuth()` like the orders routes: web cookie session
  OR a validated mobile Bearer token, identical behaviour.
- **Audit completeness** — admin order-status changes now also write
  an `audit_logs` row (`order.status_change`, `{ from, to }`), in
  addition to `order_status_history`.
- **Demo mode is fail-closed** (`src/lib/data-mode.ts`). Demo data
  activates ONLY when `NEXT_PUBLIC_DEMO_MODE=true`, or when Supabase
  env vars are missing in a non-production build. A production build
  with missing env vars and no flag renders a configuration-error
  screen (admin panel, dashboard) and answers
  `503 { error: "NOT_CONFIGURED" }` from the APIs — demo data is
  never presented as real. Local development keeps the old
  ergonomics automatically.
- **CI + Dependabot** — `.github/workflows/ci.yml` runs all test
  suites, `tsc --noEmit`, lint and a production build (with
  placeholder public env) on every push to `main` and every PR.
  `.github/dependabot.yml` opens weekly grouped minor/patch npm
  updates for `/` and `/mobile`, and monthly Actions updates.

## P1 — mobile store readiness

- **Legal pages** — `/privacy` (what is collected and why, the
  processors — Supabase for database/auth, Vercel for hosting —
  retention and deletion via the contact page, essential cookies
  only) and `/terms` (unit pricing confirmed at pickup, Express at
  1.5×, cancellation before pickup, pay online or on delivery,
  voucher rules) are live and linked from the footer. The privacy
  page doubles as the stores' privacy-policy URL.
- **App identity & build config (mobile)** — `in.zclean.app` is now
  the Android package and iOS bundle identifier, with
  `android.versionCode: 1` / `ios.buildNumber: "1"`, brand icon /
  splash / adaptive-icon assets, and an `eas.json` (development /
  preview-APK / production app-bundle profiles). Supabase sessions
  on native are stored in `expo-secure-store`. Remaining store
  blockers are owner-side (developer accounts, EAS project linking,
  listing materials, permission review) — itemised in
  `mobile/README.md` → "Store readiness".

## Delta 1 — admin extensions (tiered roles, charts, customers, notifications)

Four additions on top of the P0/P1 base. **Deployment order matters:
run `supabase/schema_v7.sql` BEFORE deploying this code** — the new
routes read `profiles.disabled` and the new `user_role` enum values.
The schema is additive and idempotent; it also promotes the e2e test
admin to `super_admin` so role management has a first owner.

### Tiered admin roles (`src/lib/roles.ts`)

`profiles.role` is now a four-tier ladder —
`customer (0) < ops_manager (1) < admin (2) < super_admin (3)`.
`getAdminGate()` (src/lib/admin.ts) still admits every admin tier,
exactly as it admitted `admin` before; individual routes add a
minimum via `roleGateError(gate, min)`, which answers
`403 { error: "FORBIDDEN_ROLE" }` below the tier. RLS needed no
policy changes: every policy calls `public.is_admin()`, and
schema_v7 redefines that one helper to recognize all three admin
tiers. The web shell and the mobile app read the same role only to
decide what to SHOW (Finance / Reports / Pricing / Settings are
hidden for ops_manager).

| Surface | ops_manager | admin | super_admin |
| --- | :---: | :---: | :---: |
| All admin GETs (queue, stages, reports, finance views, closings view) | ✓ | ✓ | ✓ |
| Order status PATCH, handovers, regenerate OTP | ✓ | ✓ | ✓ |
| Desk payments POST, refund REQUEST, voucher redeem | ✓ | ✓ | ✓ |
| Voucher issue | ✓ | ✓ | ✓ |
| Pricing PATCH, settings PATCH | — | ✓ | ✓ |
| Employees / branches create & edit | — | ✓ | ✓ |
| Expenses create & delete, close-day POST | — | ✓ | ✓ |
| Refund approve / reject / process | — | ✓ | ✓ |
| Voucher create, voucher cancel / expire (void) | — | ✓ | ✓ |
| Customer disable / enable | — | ✓ | ✓ |
| Team list (Settings → Team & Roles, read-only) | — | ✓ | ✓ |
| **Role changes** (`PATCH /api/admin/users/[id]`) | — | — | ✓ |
| MFA enrolment | self-service for every tier (unchanged) | | |

Role-change guardrails (pure, unit-tested — `canChangeRole` in
src/lib/roles.ts): only a super_admin may change a role; nobody may
demote themselves (`409 SELF_DEMOTION`); the last super_admin cannot
be demoted (`409 LAST_SUPER_ADMIN`). Every change is audit-logged as
`user.role_change { from, to }`.

New endpoints: `GET /api/admin/users?q=` (admin+; emails merged from
Supabase Auth via the service-role client, null when unavailable) and
`PATCH /api/admin/users/[id] { role }` (super_admin only).

### Dashboard charts

`GET /api/admin/analytics?days=14` (any tier, days clamps 1–90)
returns an IST-day series — orders placed plus revenue collected,
where revenue is the staff ledger's `payment` entries — and a
current status breakdown. The bucketing is pure
(`src/lib/analytics.ts`) and the dashboard renders it as
dependency-free SVG (revenue area chart, orders bar chart, status
bars). Demo mode computes the identical series from the demo stores.
The mobile admin home shows the same endpoint as a 7-day summary
card with mini bars.

### Customer Management

`GET /api/admin/customers?q=&page=&pageSize=` (any tier) and
`GET /api/admin/customers/[id]` aggregate through the service-role
client (the email lives in Supabase Auth, not profiles; the caller is
gated first). **Lifetime spend is ledger-consistent**: the sum of
`computeOrderFinance(...).effectivePaidPaise` over the customer's
non-cancelled orders — collected money, never order totals
(src/lib/customers-server.ts). The detail view adds addresses, the
last 20 orders, totals, and active vouchers (linked by
`issued_to_phone` = the customer's phone — vouchers have no customer
FK). `PATCH /api/admin/customers/[id] { disabled }` (admin+) flips
`profiles.disabled`, audit-logged as `customer.disable` /
`customer.enable`.

**Disabled-account effect:** a disabled customer can still sign in
and read their history and support pages, but `POST /api/orders`
and `POST /api/pickups` answer `403 { error: "ACCOUNT_DISABLED" }`.
Guests are unaffected (they have no account to disable).

Web: `/admin/customers` + `/admin/customers/[id]`; mobile:
Customers list + detail under the admin home (disable toggle is
admin-tier only).

### Admin notifications (derived — no new tables)

`GET /api/admin/notifications` (any tier) derives the attention list
on every read from bounded aggregates; `src/lib/notifications.ts`
holds the rules: refunds `requested` (medium) and `approved` >24h
unprocessed (high); orders stuck — PLACED / PICKUP_SCHEDULED >24h
(medium), PICKED_UP / RECEIVED / IN_PROCESS >72h (high), READY >48h
(medium); live orders with `payment_status = 'failed'` (high);
guest pickup requests (no account) older than 24h (low); active
vouchers expiring within 7 days (low); yesterday's cash day
unclosed despite cash activity (medium). Sorted severity-then-
recency, capped at 50, with `{ total, high, medium, low }` counts.
The web shell's topbar bell badges the high count; `/admin/notifications`
and the mobile notifications screen show the full list. Nothing is
stored, so items clear themselves when the underlying work is done.

Tests: `npm run test:roles`, `npm run test:analytics`,
`npm run test:notifications` (wired into `npm test`).

## Delta 2 — push notifications & in-app support

**Requires `supabase/schema_v8.sql`** (apply before deploying).

### Push architecture

```
admin status / handover route
  → notifyStatusChange (src/lib/notify.ts — log provider, unchanged)
  → push provider: orders.user_id via service-role client
  → sendPushToUser (src/lib/push.ts) → Expo Push Service → APNs / FCM
  → customer's devices (rows in push_tokens)
```

- **Token store** — `push_tokens` (schema_v8): one row per device
  install, `expo_push_token` unique across the table, RLS owner-only
  (select/insert/update/delete where `user_id = auth.uid()`); the
  service role bypasses RLS for sends and cross-account reassignment.
- **Registration** — `POST /api/push/register { token, platform }`
  (any signed-in user, cookie or Bearer; the token must pass
  `isExpoPushToken`, else `422 INVALID_PUSH_TOKEN`) upserts on the
  token: the same phone signing into a different account REASSIGNS
  the row, which is why writes run through the service-role client
  after the caller is authenticated (the written `user_id` is always
  the verified caller's). `DELETE /api/push/register { token }`
  removes the caller's row (logout hygiene / preference off). Both
  answer a minimal `{ ok: true }`.
- **Sending** — `sendPushToUser(adminClient, userId, payload)` loads
  the user's tokens, builds Expo messages (`sound: "default"`,
  `priority: "high"`), posts to
  `https://exp.host/--/api/v2/push/send` in chunks of 100, and
  PRUNES tokens whose ticket reports `DeviceNotRegistered`. It never
  throws (the notify hook's fire-and-forget standard): failures are
  logged and a `{ sent, pruned, errors }` summary is returned.
- **Copy & deep link** — `statusChangePush()` reuses the tracking
  timeline's labels/hints (`src/lib/order-flow.ts`), so push, web
  tracking and the app all say the same thing; `data` carries
  `{ orderId, url: "/orders/<id>" }` and the app's notification
  listener deep-links taps to the order tracking screen.

### Token lifecycle

Register on login / session restore → refreshed (upsert) on every
app start with a session → deleted on logout, when the user turns
"Order updates" off, and by the server when Expo reports the device
unregistered. Dead installs therefore cannot accumulate.

### Mobile client behaviour

`mobile/src/lib/push.ts` degrades silently wherever push cannot
work: web (no-op), simulators, permission denied — and **Expo Go on
Android (SDK 53+), from which Expo removed remote push entirely**;
development / standalone builds receive normally. Android order
updates land on the `orders` notification channel (created at
registration; also the app.json plugin's `defaultChannel`, icon
colour `#22786d`). Foreground notifications show as alerts; the
"Order updates" toggle on the Account tab is backed by a LOCAL
preference (AsyncStorage) — **follow-up: server-side preference
storage**, if per-account cross-device preferences are ever needed.

### OWNER-GATED delivery credentials

The pipeline above is complete, but a standalone build only
DELIVERS once EAS holds the platform credentials:
- **Android** — an FCM V1 service-account key (free Firebase
  project) uploaded to EAS credentials for `in.zclean.app`.
- **iOS** — APNs via the Apple Developer account (EAS can generate
  and manage the key once the account exists).
Until then Expo accepts the messages and the app registers tokens,
but devices will not receive them. No code change is needed when
the credentials land.

### In-app support

`BUSINESS` in `mobile/src/lib/config.ts` is the single mobile source
for support contacts, mirroring the web's `businessSettings`: the
DEMO phone/WhatsApp (`+91244567889`, owner-confirmed demo value —
replace with the real business number before launch). The web
config's email is still empty, so `BUSINESS.email` is empty and the
email action is hidden until the owner provides one — no invented
contact details. A Help & Support card (call / WhatsApp / email /
FAQs → the web `/faq` page) sits on the Account tab and on the
order tracking screen; from an order, the WhatsApp/email text is
pre-filled with the order reference.

Tests: `npm run test:push` (token validation, chunking, message
building, pruning decisions, status copy — wired into `npm test`).

## Delta 3 — Laundra fidelity pass, real reviews & blog

**Requires `supabase/schema_v9.sql`** (apply before deploying).
The design comparison behind this delta is in `FIDELITY_NOTES.md`.

### Fidelity pass (homepage + shared chrome)

The homepage now follows the reference's section rhythm end to end —
hero → trust strip → about → why-choose-us → services → how it works
→ care process → pricing teaser → testimonials → blog → FAQ teaser →
CTA — with one typography/spacing scale throughout (section padding
`py-16 sm:py-20`, `text-3xl sm:text-4xl` section headings under small
uppercase eyebrows) and the existing shared `Reveal` scroll animation
on every section. The hero headline steps up to `text-5xl/6xl` and
gains a **trust strip of service facts only** (areas served from
`serviceAreas`, free pickup & delivery ≥ ₹299, regular & express,
pay online or on delivery) — where the reference shows volume stats,
we show facts; there are no invented numbers anywhere on the page.
The **pricing teaser** reads the same DB-first catalogue as the
pricing page (`loadStorefrontCatalogue`), so admin price edits move
it too. The **FAQ teaser** and the `/faq` page now share one source
(`src/lib/faqs.ts`). The footer gained a Blog link, opening hours
(only when the owner configures them), and an **Areas we serve**
strip listing the 13 Bokaro Steel City areas with pincodes — the
same list the booking flow gates on.

### Reviews — testimonials that are earned, not written

`reviews` (schema_v9) is the ONLY source of testimonials:

- **Write** — `POST /api/reviews` (signed-in, cookie or Bearer): the
  order must belong to the caller and be `DELIVERED`
  (`422 ORDER_NOT_DELIVERED`), one review per order
  (`409 ALREADY_REVIEWED` from the `unique(order_id)` constraint),
  rating 1–5 and text 3–1000 chars (`reviewCreateSchema`, mirroring
  the DB CHECKs). RLS enforces the same rules again at the database.
  Reviews are born `approved = false`.
- **Publish** — staff moderation at `/admin/reviews`: the list
  (`GET /api/admin/reviews?filter=pending|approved|all`, any admin
  tier) plus `PATCH` (approve/un-approve) and `DELETE` on
  `/api/admin/reviews/[id]`, mutations admin-tier only and
  audit-logged (`review.approve` / `review.reject` / `review.delete`).
  In demo mode the queue shows an explainer, never sample reviews.
- **Read** — the homepage Testimonials section and
  `GET /api/reviews/approved` show the latest 12 approved reviews
  with FIRST NAME + delivery AREA only (never email/phone). **Zero
  approved reviews → the section does not render at all.** There is
  no seed data and no placeholder content on this path.
- **Prompts** — `GET /api/orders/[id]` now includes the owner's own
  `review` (or null); the web order page and the mobile order screen
  show the form (stars + text) on DELIVERED orders and a thank-you
  state afterwards that says plainly the review is checked by the
  team before it appears on the website.

### Blog

Three original articles in `src/content/blog.ts` (typed structured
blocks rendered by `src/components/BlogBody.tsx` — no new
dependencies): silk saree & festive wear care (2026-11-10), wash &
fold vs wash & iron vs dry cleaning (2026-11-06), and a monsoon
laundry guide for Jharkhand's rains (2026-11-02). Content rule: only
facts already true on this site (services, approved prices, areas,
process) may be stated about Z-clean — no invented statistics or
customer stories; `test:blog` greps for fabricated-claim phrasing.
Pages: `/blog`, `/blog/[slug]` (SSG, with related-service CTA), a
homepage section with the latest three, and Blog links in the header
nav and footer.

Tests: `npm run test:reviews` (28 — eligibility, byline privacy,
stars, DTO joins) and `npm run test:blog` (48 — content contract +
integrity guard), wired into `npm test`.

## Phase A — premium website redesign (CleanPro language)

A visual-language pass over the customer website, following the
owner's CleanPro concept references (design comparison:
`FIDELITY_NOTES.md`, Phase A section). Chrome and composition only —
no schema, API, data or behaviour changes; the admin panel and the
mobile app are untouched.

- **Design tokens** — a pastel `mist` scale and deep-navy aliases, a
  soft `shadow-soft*` elevation scale, pastel gradient utilities and
  reduced-motion-safe float animations join the existing teal brand
  tokens in `globals.css`. The storefront card recipe is now
  `rounded-[2rem] bg-white shadow-soft ring-1 ring-mist-200/70`.
- **Header** — glassy sticky bar with a Services dropdown (all 8
  services), Pricing / Blog / Track / Help, and a **Get the App**
  pill leading to the new `/app` page (Android: the project's Expo
  builds page; iOS: App Store release in preparation — stated
  honestly, no dead badge).
- **Homepage** — the owner's headline "The New Level of Care for
  Your Wardrobe" over a pastel gradient, a floating garment
  composition (`HeroVisual`) in place of the rotating slider, dual
  CTA (Schedule a Pickup / Track Your Order), and the Delta 3 trust
  strip restyled as glass fact cards. Homepage service cards now
  show "From ₹X" from the live catalogue (`HomeServices`).
- **Dashboard & orders** — floating cards throughout; order cards
  use the garment-card shape with real quantities, dates, refs and
  totals from the existing APIs.
- **Integrity** — the references' star rows, avatar clusters and
  customer counts are fabricated social proof and were NOT adopted;
  trust elements remain computed service facts only.

## Staff Web App + live tracking backend (schema_v10)

The field side of Z-clean: riders work from a mobile-first web app
at `/staff` (no separate native app), and the office runs it from
the existing admin console. Design: `STAFF_APP_SPEC.md` in the
project root. Migration: `supabase/schema_v10.sql` (apply after
schema_v9).

### How a rider gets access (the invite lifecycle)

1. The employee record needs an **email address** (Employees →
   Edit). Without one, the invite button honestly says so — there
   is nowhere to send the invite.
2. An admin-tier user clicks **Invite to staff app** on the employee
   (`POST /api/admin/employees/[id]/invite`). Supabase Auth emails
   an invite link (`inviteUserByEmail`, service role) whose redirect
   lands on **`/staff/set-password`**; the endpoint simultaneously
   links the account: `employees.user_id` = the new user and
   `profiles.role = 'staff'`.
3. The rider opens the email, sets a password on
   `/staff/set-password` (same machinery as password reset), and can
   sign in at `/staff`.
4. Re-inviting a linked employee cannot send a second invite
   (Supabase will not invite an existing user twice), so the
   endpoint instead emails a fresh **password-set link** (a
   password-recovery email landing on the same
   `/staff/set-password` page) and returns state `reset_sent`; the
   Employees row shows a **Send password-set link** button for
   linked staff. "Already linked" survives only as the fallback
   when no email address exists for the linked account. If the
   email already belongs to an existing account (e.g. they are
   also a customer), that account is linked instead and the UI
   says so — no second account is created.

**Troubleshooting — "This invite link is not valid":** invite
links are **single-use**. The moment one is opened, Supabase
consumes it; reopening the same email link afterwards reports it
expired. If a rider lands on the invalid screen (expired link, or
one consumed by an earlier open), do not forward the old email —
in Employees, click **Send password-set link** on their row to
email a fresh one. (The landing pages establish the session from
the link's URL fragment themselves — see
`src/lib/link-session.ts` — because the PKCE-pinned browser
client cannot consume the implicit-flow tokens GoTrue redirects
with; that mismatch was the 2026-11-05 invite bug.)

**One manual setup step:** `https://<your-domain>/staff/set-password`
must be added to the Supabase Auth **Redirect URLs** allowlist
(Authentication → URL Configuration), exactly like `/reset-password`
was — otherwise invite links land on the site root.

### Rounds: assignments

- On the admin order page, the **Rider assignments** card assigns
  the order's **pickup** and **delivery** legs (`POST/PATCH
  /api/admin/orders/[id]/assignments`, ops_manager+). Only active
  employees holding the leg's handover-chain role are eligible
  (pickup → `picker`; delivery → `delivery_staff` or
  `transporter_outbound`) — the rule is the pure
  `canAssignEmployee` in `src/lib/tracking.ts`, re-checked on save.
- One ACTIVE assignment per (order, leg) is enforced in the
  database by a partial unique index; reassigning completes the old
  row and inserts the new one. An assignment closes when its leg's
  handover completes, or by an admin override ("Close" — for a leg
  that will not run; normal completion stays handover-driven).
- In `/staff`, a rider sees **only their own** active assignments
  ("My rounds", auto-refreshing). Admin tiers get a read-only
  support view of all rounds. Each round shows the address, a
  Google Maps **Navigate** deep link, **Call customer**, the item
  count, the slot, and — on delivery legs — the COD amount still to
  collect from the finance ledger.

### Location sharing — and its honest limit

- The rider taps **Start sharing** on a round. The staff app uses
  the browser Geolocation API (`watchPosition`), thinned by the
  shared throttle (at most one ping per 15 s, only after moving
  25 m, plus a 2-minute heartbeat) and POSTed to
  `POST /api/tracking/ping`.
- **Foreground only.** A web page cannot track in the background:
  closing the tab or locking the phone pauses updates, and the
  panel says exactly that ("keep this tab open"), requests a screen
  Wake Lock while sharing, and explains every permission state in
  plain language. There is no background tracking claim anywhere.
- Authorization is **assignment-based, never role-based**: a ping
  is accepted only when the assignment exists, belongs to the
  caller's linked employee record, and is still active
  (`canPingAssignment`). `rider_locations` has NO client insert
  policy — rows are written by the API through the service role
  only after those checks pass — and the endpoint is rate-limited
  (12/min/user). Admins cannot ping: support view is read-only.
- `GET /api/tracking/[orderId]` (order owner or admin tier) returns
  the latest position, the current assignment, and coordinates for
  the customer map (Phase D): the facility pin (the assigned
  rider's branch `lat/lng`, set on the branch in the admin console;
  fallback: any active pinned branch, plants first) and the
  destination pin (the order address's geocoded `lat/lng`).

### Doorstep handovers from the staff app

`POST /api/staff/tasks/[assignmentId]/handover` completes the leg's
OTP point — the rider types the **customer's 6-digit code** (QR
scanning is not offered: the web app has no camera-scan pattern,
and the OTP is the customer's proof either way). The assignment
fixes the point and the receiving employee (the rider themselves);
everything else — sequence, role eligibility, OTP attempts and
lockout, status effects, COD cash semantics, notifications — runs
through the SAME shared flow as the admin console
(`src/lib/handovers-server.ts`, extracted from the admin route;
the state machine is not forked). On delivery legs the rider ticks
"I collected ₹X in cash" when they took the COD balance.

### Roles & schema (schema_v10)

- `profiles.role` gains **`'staff'`**. It is deliberately NOT an
  admin tier: `is_admin()` is untouched, the admin gate still
  rejects staff, and every staff capability derives from
  assignments. A staffer's admin-API calls return 403.
- New tables: `order_assignments`, `rider_locations` (RLS:
  positions readable by the order's owner, admin tiers, or the
  rider who recorded them; both are in the `supabase_realtime`
  publication for the Phase D live map).
- `addresses` and `branches` gain `lat`/`lng` pins. Address pins
  are filled by a **Nominatim (OpenStreetMap)** geocode when an
  address is written (saved-address create and order placement),
  scheduled with Next's `after()` so the platform keeps the
  invocation alive until the lookup finishes — the write's own
  response never waits for it, and failures leave the pin null and
  never block the write. The geocoder walks a **fallback ladder**
  (full address → area → pincode → city; first hit wins, result
  cached on the row) because Nominatim has no street- or
  area-level coverage for Bokaro — see "Destination pin precision"
  under Phase D for what that means and how the app stays honest
  about it. The tracking feed additionally heals a missing pin
  on read (one best-effort ladder walk, persisted). (The original
  schema's unused `addresses.latitude/longitude` columns are
  left in place; reads prefer the new pair and fall back to the
  legacy one.)

## Phase D — customer live tracking map

The customer half of tracking: the order page
(`/orders/[id]`, live mode) gains a **Live tracking** card under
the timeline, driven entirely by the feed described above plus
Supabase Realtime. The pure decisions live in
`src/lib/tracking-view.ts` (tests: `scripts/test-tracking-view.mjs`);
the card is `src/components/LiveTrackingCard.tsx` and the map is
`src/components/LiveTrackingMap.tsx`.

### When the card exists at all

`trackingCardState` shows the card ONLY while a leg is genuinely
live — an **active** rider assignment whose leg matches the
order's lifecycle position (pickup leg while `PLACED` /
`PICKUP_SCHEDULED`; delivery leg while `OUT_FOR_DELIVERY`). No
rider assigned, a completed assignment, or a leg/status mismatch
→ the card renders nothing. Tracking is simply not on offer for
that order yet; there is **no placeholder map, no stock imagery,
and no simulated marker anywhere** in the feature. Within a live
leg: assignment-but-no-ping-yet shows an honest *waiting* state
("Your rider hasn't started sharing location yet…"); a position
older than **3 minutes** flips the card to *stale* — the marker
stays on the last reported spot and the copy says updates are
paused, with the last-seen time.

### The map

- **Leaflet + OpenStreetMap tiles** (the `leaflet` package,
  dynamically imported `ssr: false`, so it never enters the
  page's initial bundle). The map shows **real map data for the
  order's own Bokaro addresses** — never stock or reference
  imagery (see `FIDELITY_NOTES.md`).
- Markers: the rider (exactly on the last real ping — never
  interpolated or projected forward), the customer's address pin
  (only when the address geocoded), and the facility pin (only
  when a branch has owner-set coordinates).
- The route line is the **OSRM** road geometry for the rider's
  current reported position — drawn only when OSRM produced it
  for that exact position, replaced as fresher positions arrive.

### Destination pin precision — said plainly

The destination pin is only as precise as OpenStreetMap's data
for Bokaro, and that data is thin: Nominatim resolves **no**
street- or area-level Bokaro address (verified live — "Sector 4,
Bokaro Steel City, 827004" returns nothing). The geocoder
therefore walks a fallback ladder — full address, then area,
then **pincode**, then city — and takes the first hit. In
practice a Bokaro address lands at **pincode precision**: the
postcode centroid (827004 → 23.6687, 86.1488). In Bokaro a
pincode maps closely to a sector, so the pin genuinely marks
**the customer's area** — but it is NOT their doorstep, and the
app never pretends otherwise:

- the pin means "your rider is heading to your area";
- **distance and ETA chips are area estimates**, computed from
  that pin — ETA is already labelled "Estimated arrival", and no
  chip ever shows a doorstep-accurate figure the data cannot
  support;
- the matched precision is recorded in the server log on every
  geocode (`[geocode] … at pincode precision`), so what the map
  is standing on is always auditable.

If Bokaro's OpenStreetMap coverage improves, the same ladder
starts winning at the address/area rungs automatically — no
code change, just better data.

### Live updates: realtime + poll, newest wins

Positions merge from two sources by `recordedAt` — whichever is
newer wins, arrival order is irrelevant (`mergeLatestPosition`):

1. **Supabase Realtime** `INSERT`s on `rider_locations` filtered
   to this order (RLS scopes the stream to the order's owner).
2. A **20 s poll** of `GET /api/tracking/[orderId]` as
   fallback/heartbeat, which also refreshes the assignment, the
   order-status context and the pins. A 401/403/404 retires the
   card quietly.

### The chips — real or hidden

- **Distance to you**: haversine between the rider's last ping
  and the geocoded address — only when BOTH points exist.
- **Estimated arrival**: OSRM's road duration between the same
  two points, labelled as an estimate. No OSRM answer (failure,
  "NoRoute", malformed body) or a missing point → **no chip** —
  never a guessed number.
- **Updated … ago**: ticks locally from the last ping's real
  timestamp.

### The 12-stage timeline

The order page now passes the 12-stage presentation to
`OrderTimeline` (an opt-in `presentation` prop — the component's
canonical rail, and the admin order detail that also uses it,
are unchanged). Stages: Order placed → Pickup scheduled → Rider
on the way → Picked up → Received at facility → Washing → Drying
→ Ironing → Quality check → Packed → Out for delivery →
Delivered. Derivation (`presentationStages`) is real-signal
only: canonical status for the outer stages; "Rider on the way"
lights ONLY while a pickup assignment is active; the care stages
key off the order's recorded plant handover milestones
(`plant_processing` / `plant_finishing` / `plant_qc` /
`plant_packing`). One documented wrinkle: the plant records ONE
Processing handover for the wash cycle and drying is part of
that cycle (the care process's "Processing" = washed or dry
cleaned), so **Drying completes together with Washing** at that
real handover and never poses as the current stage on its own;
"Ironing" is the chain's Finishing stage. Canonical notes from
the status history ride along on their stages, as before.
Statuses, OTPs, payments and reviews are untouched by this
phase; the dashboard cards are unchanged too.

## Phase 5 — 3D experience (Scope M)

The premium-motion layer: a real-time 3D hero, CSS-3D garment
cards, and gentle motion on the live tracking map. All of it is
progressive enhancement over the Phase A design — every surface
keeps a complete static presentation, and the booking, dashboard
and order flows are untouched by it. The pure motion RULES live
in `src/lib/motion.ts` (tests: `scripts/test-motion.mjs`, wired
into `npm test`); components own only the side effects.

### The 3D hero (homepage only)

`src/components/HeroShowcase.tsx` renders the static photo
composition (`HeroVisual`) by default — that is the server
render, the loading state, and the permanent presentation for
two of the three fallback cases below. Only when the capability
rule in `src/lib/motion.ts` (`heroRenderMode`) says yes does it
mount `HeroScene3D` (React Three Fiber), lazy-loaded via
`next/dynamic` with `ssr: false`:

| Condition | Hero shown |
|---|---|
| WebGL available + motion allowed | 3D scene |
| `prefers-reduced-motion: reduce` | Static composition |
| WebGL unavailable / context fails | Static composition |
| Scene chunk loading or throws | Static composition (error boundary + `onError` fallback) |

The scene itself is a stylised real-time interpretation of the
owner's reference board: **one pristine white dress shirt**
floating upright — collar band and leaves, a buttoned front
placket, long sleeves angled gently down, a chest pocket —
beside a neat **folded-garment stack**, over a soft pedestal
glow on the hero's pastel backdrop, with sparse drifting
particles, slow levitation, a subtle sway, and damped
pointer-parallax. Lighting is image-based (see the realism
pass below) plus three directional lights (no shadow maps;
the ground shadow is drei `ContactShadows`).

**Licence: every mesh is procedural geometry** built in
`src/components/HeroScene3D.tsx` (parametric cloth panels,
swept tube sleeves, rounded boxes) with cloth-like physical
materials. There are **no model files, no image textures and
no external assets**; the only textures are canvases generated
at runtime (a cotton-weave pattern, radial gradients for the
particle sprite and ground glow, and the studio backdrop
gradient). Nothing was taken from the reference site.

### Realism pass (2026-11-05)

The owner's verdict on the first scene was "cartoon" — a flat
extruded silhouette under flat lights. The rebuild keeps the
composition and the fallback/perf contracts, and replaces the
shirt and the rendering:

- **Image-based lighting** — the scene environment is a
  `RoomEnvironment` rendered through `PMREMGenerator` on the
  visitor's device (`StudioEnvironment` in the component). No
  HDR file is downloaded or shipped; the environment is
  generated locally at runtime, so the asset rule above is
  intact. ACES tone mapping, exposure 1.06.
- **The torso is a parametric cloth surface** — front and back
  panels sampled from shared surface functions (waist taper
  via a spline width profile, chest/waist depth fullness, a
  shirttail hem, a scooped front neckline), closed by bulged
  seam strips. Drape undulations and micro-wrinkles are baked
  into the vertices; the **placket is displaced into the
  surface** (a raised centre strip with stitch grooves), and
  the buttons and chest pocket are placed from the same
  surface functions, so they hug the cloth.
- **Sleeves are tapered tubes** swept along drooping
  CatmullRom curves with a forward bend — shoulder cap, cuff
  band, cuff button, and a shadowed sleeve opening.
- **Fabric has a weave** — a canvas-drawn plain-weave pattern
  feeds the bump map and a roughness map (≈0.78 average) of
  every cloth material; sheen is tuned (roughness 0.5) and the
  clearcoat sheen of v1 is nearly gone. Buttons are glossy
  pearl domes (clearcoat 1).
- **Stage** — a painted blue-grey studio backdrop (canvas
  gradient with a soft light pool) sits behind the garments,
  matching the reference board; particles halved (110 → 55)
  and faded; contact shadows softer (blur 3.4, opacity 0.30).
- The folded stack wears the same weave materials, gains a
  folded-over top flap and softer slab radii.

### Performance contract (verified in the production build)

- three.js ships in **its own lazy chunks** (five files, listed
  in `react-loadable-manifest.json` against
  `HeroShowcase.tsx -> ./HeroScene3D`). A manifest sweep after
  the Phase 5 build confirmed **none of the 104 routes' initial
  bundles contains any of them** — `/order`, `/dashboard` and
  `/orders/[id]` First Load JS are byte-for-byte the Phase D
  numbers (140 / 136 / 200 kB); `/` rises 107 → 117 kB, which is
  the showcase/tilt/motion code itself, not three.js. The served
  homepage HTML references no 3D chunk at all.
- The canvas is `pointer-events: none` (parallax reads a window
  listener), so it can never block the hero CTAs.
- DPR is capped at 2 (1.5 on small screens); the render loop
  pauses when the hero scrolls off-screen or the tab hides
  (IntersectionObserver + visibilitychange → `frameloop`).
- Geometry counts stay small: the torso panels are 65×81-vertex
  grids (~10k triangles for both), sleeves are 37×21 tubes, ~35
  meshes total, 55 points, and four runtime canvas textures
  (weave ×2 at 256², backdrop at 1024×512, sprites). The realism
  pass grew the lazy 3D chunks by ~9 kB total (~966 kB raw
  across the same five files); `/` First Load JS is unchanged
  at 117 kB.

### Interactive garment cards (CSS 3D, no WebGL)

`ServiceCard` — the shared garment card on the homepage and the
services index — is wrapped in `src/components/motion/Tilt.tsx`:
a fine pointer tips the card toward the cursor (clamped to
±8° by `tiltFromPointer`) and sweeps a soft sheen across it.
Touch/coarse pointers and reduced-motion visitors get exactly
the Phase A card; the tilt writes styles directly to the DOM
node (no re-render per move), the sheen overlay is
pointer-events-none, and keyboard focus is unchanged.

### Tracking motion (Phase D map)

- When a **new real position** arrives, the rider marker now
  **glides** from the previous recorded position to the new one
  over ~1 s (`planMarkerTransition` / `markerPositionAt` in
  `src/lib/motion.ts`). It is a visual transition between two
  genuine reports only: it never goes beyond the newest
  recorded point, never follows the route, and it **snaps**
  instead for a first fix, a near-identical point, a jump over
  1.5 km, or a reduced-motion visitor.
- The route line draws itself on (dash-offset) the first time
  each OSRM geometry appears; reduced-motion skips the draw-on.
- The rider pin carries a soft pulse ring **only while the card
  is LIVE** — stale and waiting states never pulse.
- Everything else about Phase D is unchanged: the visibility
  states, stale threshold (3 minutes), merge semantics
  (newer `recordedAt` wins) and chip hide-rules are byte-identical.

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
   `supabase/schema_v3.sql` — also additive and safe to re-run. Finally,
   for Phase 8 (the handovers ledger and the orders QR/OTP columns), run
   `supabase/schema_v4.sql` — likewise additive and safe to re-run.
   Finally, for Phase 9 (the payment ledger, refunds, expenses, cash
   closings and the `partially_paid` status), run
   `supabase/schema_v5.sql` — also additive and safe to re-run.
   Finally, for P0 hardening (the `rate_limits` table + `rate_limit_hit()`
   function and the two orders reporting indexes), run
   `supabase/schema_v6.sql` — also additive and safe to re-run.
   Finally, for Delta 1 (the `ops_manager` / `super_admin` role tiers,
   `profiles.disabled`, and the tier-aware `is_admin()`), run
   `supabase/schema_v7.sql` — additive and safe to re-run, and it must
   be applied BEFORE deploying the Delta 1 code.
   Finally, for Delta 2 (the `push_tokens` table for push
   notifications), run `supabase/schema_v8.sql` — additive and safe
   to re-run, and it must be applied BEFORE deploying the Delta 2
   code.
   Finally, for Delta 3 (the `reviews` table behind customer
   testimonials), run `supabase/schema_v9.sql` — additive and safe
   to re-run, and it must be applied BEFORE deploying the Delta 3
   code.
2. In Supabase Auth settings, set the Site URL to your app URL
   (e.g. `http://localhost:3000` in development), and add
   `<site-url>/reset-password` to the Redirect URLs allow list so
   password-reset links land on the reset page.
3. To make a user an admin, update their row:
   `update profiles set role = 'admin' where id = '<auth-user-id>';`
   (Delta 1: roles can afterwards be managed in the admin panel —
   Settings → Team & Roles — by a `super_admin` account.)

## Run

```bash
npm run dev     # http://localhost:3000
npm run build   # production build check
npm start       # serve the production build
```

Without Supabase env vars the public site still renders; the login and
registration pages show a "being set up" notice, and Phase 2 flows
(schedule pickup, dashboard) run in clearly labelled DEMO MODE backed by
browser localStorage — in development. In a PRODUCTION build, missing
env vars no longer activate demo mode unless `NEXT_PUBLIC_DEMO_MODE=true`
is set; the app fails closed with a configuration error instead
(see "Demo mode is fail-closed" above).

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
