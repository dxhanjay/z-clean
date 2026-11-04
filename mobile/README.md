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

## Not yet

- App icon / splash assets: `app.json` intentionally carries no
  icon references in this phase — the PNG assets are binary and are
  added through a binary-capable channel before store builds (the
  web PWA icons in `app/public/icons/` + `scripts/generate-icons.mjs`
  are the brand source).
- Push notifications and online (Razorpay) payment in-app.
- Finance, reports, pricing and settings in-app — Mobile Phase 3.
