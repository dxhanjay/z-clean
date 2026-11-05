# Z-clean mobile app (Expo — Android & iOS)

The native companion to the Z-clean web app, in the same repo
(`app/mobile/`). Expo SDK 58 · expo-router · TypeScript · Supabase.

## What it does (Mobile Phase 1)

- **Auth** — email/password sign-in + registration against the same
  Supabase project as the web app; the session persists in
  AsyncStorage. The admin flag comes from `profiles.role`.
- **Customer** — Home (services + live prices from the database,
  bundled approved list as fallback), Place Order (quantity steppers
  incl. 0.5 steps for kg/sq-ft items, the 13 service areas, pickup
  date/slot, regular/express, Pay on Delivery + gift-voucher code),
  My Orders, and Order Detail (timeline, QR code, pickup/delivery
  OTPs, totals + payment breakdown, outstanding balance).
- **Admin** (profiles.role = 'admin' only) — order queue with status
  filter, order detail with valid-next-status actions and Mark COD
  collected, and a "More admin tools" index.

## Mobile Phase 2 — admin operations in-app

- **Handover completion** on each admin order: the full Phase 8
  chain with completed points, the order's QR + OTP states (with
  OTP regeneration), and the next-point card — receiving-employee
  picker filtered to the point's roles, 6-digit OTP entry for the
  doorstep points, and for QR points a **camera scanner
  (expo-camera)** with a paste/type fallback. Quantity stepper,
  missing-item flag, delivery COD collection — server errors are
  shown verbatim (OTP_MISMATCH / OTP_LOCKED / OUT_OF_SEQUENCE /
  ROLE_MISMATCH / QR_MISMATCH). The Phase 1 plain status actions
  remain available alongside, exactly as on the web.
- **Stage queues** — pick an active employee, see the points their
  roles can receive at and the orders waiting at each.
- **Gift vouchers** — list + status filter + code search, campaign
  create (prepaid vs promo), issue / cancel / expire, transaction
  history.
- **Employees** — list with role/status filters, create/edit across
  the 12-role matrix, activate/deactivate.
- **Branches** — plants / collection centers / branches, create/edit,
  manager link, active toggle.
- Still web-only (Mobile Phase 3): finance, reports, pricing,
  settings — the in-app index links out to the real web admin.

## Mobile Phase 3 — finance, reports & editors in-app

- **Finance** — IST day summary with the gateway-vs-desk collection
  split, expected-cash card, **close the day** (counted cash, with
  the server's ALREADY_CLOSED surfaced) and closing history;
  **outstanding balances** (tap through to the order); the **refund
  queue** with approve/reject and a confirm-gated process step.
- **Expenses** — range-filtered list (the API's `?from`/`?to`),
  add-expense form across the 8 categories, audit-logged delete.
- **Per-order payments & refunds** on each admin order: the full
  finance breakdown (gateway + ledger + the legacy-settled note),
  record a payment (server errors such as OVERPAYMENT /
  NOTHING_OUTSTANDING shown verbatim), request a refund, and the
  order's refund list with inline approve/reject/process.
- **Reports** — 7/30/90-day periods: sales by day/service/area,
  processed-by-plant, pending-order aging, employee performance,
  voucher usage (incl. outstanding gift-card liability), retention,
  expenses by category, and the sales-vs-expense net. Empty sections
  say "No data yet" rather than inventing numbers.
- **Pricing & settings editors** — per-item price / express
  multiplier / active with the web's ₹→paise conversion, and the
  business settings with paise keys edited in rupees; only changed
  keys are sent.
- **Receipt** — customer and admin order screens open the live
  printable web receipt (`/orders/<id>/receipt`).

**The mobile app is now complete**: every admin section that exists
on the web exists natively in the app, on the same APIs. The admin
index keeps one convenience link to the web admin for wide tables
and printing.

Ordering requires sign-in — there is deliberately **no demo mode**
in the app. All API calls go to the production backend with the
session's access token as `Authorization: Bearer <token>` (see the
web README's "Mobile — Phase 1" section for the server contract).

## Configuration

Defaults live in `app.json` → `extra` (API base URL, Supabase URL,
Supabase **publishable** key — public by design; the service-role
key must never be added). Override per build with:

```bash
EXPO_PUBLIC_API_BASE_URL=... EXPO_PUBLIC_SUPABASE_URL=... \
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=... npx expo start
```

## Develop & verify

```bash
npm install
npx expo start          # Expo Go / dev client
npx tsc --noEmit        # typecheck (must be clean)
npx expo export         # production bundle check
```

## Money maths

`src/lib/totals.ts` is a deliberate port of the web engine
(`app/src/lib/totals.ts`) — read its header before touching it. The
server re-computes every order total and rejects mismatches, so the
two must stay in lock-step.

## Delta 1 — roles, customers, notifications in-app

- **Tiered roles** — `src/lib/roles.ts` mirrors the web ladder
  (customer 0 < ops_manager 1 < admin 2 < super_admin 3). AuthContext
  exposes `role` / `roleLevel`; the Admin tab now opens for every
  admin tier, and the admin home hides Finance / Expenses / Reports /
  Pricing / Settings below the admin tier (the API enforces the same
  minimums server-side with `403 FORBIDDEN_ROLE`).
- **Admin home** — header shows the caller's tier label, and a
  "Last 7 days" card (orders + collected revenue with mini bars)
  reads `GET /api/admin/analytics?days=7`; a high-priority alert
  count links through to Notifications.
- **Customers** — list (search + pagination) and detail (profile,
  addresses, recent orders, phone-linked vouchers) over
  `/api/admin/customers`; the disable/enable switch shows for the
  admin tier and up.
- **Notifications** — read-only list over
  `GET /api/admin/notifications`; tapping an item deep-links to the
  order, finance, vouchers or queue section it belongs to.

## Delta 2 — push notifications & in-app support

- **Push** (`src/lib/push.ts`, `expo-notifications`): registers the
  device's Expo token with `POST /api/push/register` after login /
  session restore (AuthContext), deletes it on logout. Foreground
  pushes show as alerts; tapping one deep-links to the order
  tracking screen. Android uses the `orders` channel (brand colour
  `#22786d`, also the app.json plugin's default). Degrades silently
  on web, simulators and denied permission — and in **Expo Go on
  Android (SDK 53+), which cannot receive remote push at all**;
  delivery to standalone builds additionally waits on owner-side
  EAS credentials (FCM V1 / APNs) — see the web README's Delta 2
  section.
- **Preference** — "Order updates" toggle on the Account tab,
  backed by a local AsyncStorage setting; off also deletes the
  server token. Server-side preference storage is a follow-up.
- **Support** (`src/components/SupportCard.tsx`): Help & Support on
  the Account tab and on the order tracking screen — call /
  WhatsApp / email / FAQs from `BUSINESS` in `src/lib/config.ts`
  (demo number, mirroring the web config; email hidden until the
  owner sets one). WhatsApp/email text is pre-filled with the order
  reference when opened from an order.

## Delta 3 — order reviews in-app

- The order tracking screen shows a **review card** on DELIVERED
  orders (`src/components/ReviewCard.tsx`): star picker + text,
  submitted via `submitReview` in `src/lib/api.ts` to
  `POST /api/reviews`. `GET /api/orders/[id]` now carries the
  customer's own `review` (`OrderReview` in `src/lib/types.ts`), so
  an already-reviewed order shows the thank-you state instead —
  including the note that reviews are checked by the team before
  they appear on the website (staff moderation, web README
  "Delta 3"). A 409 ALREADY_REVIEWED (e.g. reviewed on the web
  first) resolves to the same grateful state.

## Not yet

- Online (Razorpay) payment in-app.
- Finance, reports, pricing and settings in-app — Mobile Phase 3
  (delivered; see the phase sections above).

## Store readiness (P1 pack)

Cleared from the audit's store-blocker list (`AUDIT_FINDINGS.md`):

- **Identity (blocker 1):** `app.json` now sets
  `android.package` and `ios.bundleIdentifier` to `in.zclean.app`.
- **EAS configuration (blocker 2, repo side):** `eas.json` exists
  with `development` (dev client, internal), `preview` (internal,
  Android APK) and `production` (auto-increment, Android app-bundle)
  profiles. `extra.eas.projectId` is still absent on purpose — it is
  written by `eas init` when the owner links the project to their
  Expo account; that linking (and the one-time Expo sign-in) is an
  owner step, not a repo step.
- **Icon / splash (blocker 3):** `app.json` references
  `assets/icon.png` (1024×1024), `assets/splash-icon.png`
  (1024×1024, contain on brand teal `#22786d`),
  `assets/adaptive-icon.png` (1024×1024) and
  `assets/favicon.png` (64×64) — the geometric white "Z" on brand
  teal, matching the PWA brand mark. The PNGs are binary, so they
  enter the repo through a binary-capable channel (GitHub web UI),
  not the text snapshot push; they live in `mobile/assets/` in the
  workspace.
- **Native versioning (blocker 4):** `android.versionCode: 1`,
  `ios.buildNumber: "1"` (marketing version stays `1.0.0`).
- **Session storage hardening (blocker 6):** Supabase Auth sessions
  on native now persist via `expo-secure-store` (Keystore/Keychain)
  instead of plaintext AsyncStorage — see `src/lib/supabase.ts`.
  Values over SecureStore's 2048-byte limit spill to AsyncStorage
  (stale copies are cleaned from the other store); web keeps using
  AsyncStorage/localStorage. On first launch after this update an
  existing session is picked up from the old store once and
  re-stored securely; worst case, the user signs in again once.

Still owner-side before a store submission can happen:

- Developer accounts: Google Play Console and Apple Developer
  Program enrolment, and the signing credentials EAS manages.
- EAS project linking (`eas init`) under the owner's Expo account.
- Store-listing materials: screenshots, descriptions, support URL,
  Google Play Data Safety answers and Apple privacy labels. The
  privacy policy itself now exists on the web app at `/privacy`
  (with `/terms`), which covers the policy-URL requirement.
- Android permission review against the first real build's merged
  manifest (only possible once EAS builds run).
