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

## Setup

```bash
npm install
cp .env.example .env.local   # fill in your Supabase + Razorpay (test) keys
```

1. Create a Supabase project, then run `supabase/schema.sql` in the SQL
   editor. It creates all tables, RLS policies, the signup profile trigger,
   the services seed and empty settings rows. For the demo, also run
   `supabase/seed_demo.sql` (demo prices, areas, settings, coupon).
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
