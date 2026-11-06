# Changelog

All notable changes to Z-clean. (This file was started at Delta 1;
earlier history lives in the README's phase sections and the git log.)

## Staff app — Web3D glass UI + operability pass (2026-11-06)

The staff app (`/staff`) gets the marketing site's glass +
3D-motion language and a field-operability overhaul.
**Presentation only — no `/api` route, auth rule, assignment /
OTP / ping contract, role scoping or admin page changed, and no
new dependency added** (no WebGL; motion stays in
`src/lib/motion.ts` + CSS keyframes, transforms/opacity only).

### Added
- **Glass staff shell**: `AmbientBackground` mounted in the staff
  layout only (`SiteChrome` already excluded `/staff`, so the
  backdrop cannot leak into customer/admin shells), glass sticky
  header, glass task cards with 3D reveal + fine-pointer-only
  Tilt, card-shaped loading skeletons, friendly glass empty and
  error states with a 48px Retry.
- **Up-next hero card**: the rounds list now leads with the first
  round whose handover is unlocked (`nextTaskId`, motion.ts §5);
  the rest of the queue keeps assignment order.
- **Leg progress stepper** (`StaffLegProgress`): Travel →
  Handover with an easing fill between its three honest states —
  deliberately NOT the plant's 12-stage timeline, which is not
  the rider's progress.
- **Animated success check** (`StaffSuccessCheck`): an SVG
  circle + tick that draw on when a handover completes (and on
  the invite done state, at a smaller size); static and fully
  drawn under reduced motion.
- **Sticky bottom action bar** on the task detail: the primary
  action for the current state ("Start sharing location" /
  "Enter code & complete …") is always thumb-reachable and
  scrolls to its panel.
- **17 unit tests** for the new pure rules (`test-motion.mjs`
  §5: leg steps/progress, up-next pick, ping failure streak,
  OTP box shaping). Suite: 908 → 925 passing.

### Changed
- **OTP entry is six boxes** with auto-advance, paste
  distribution and backspace-step-back (`otpApplyInput`); the
  submit contract is identical — the joined 6-digit `otp` string
  to the same endpoint — and a completed handover now shows a
  spinner → success-check sequence.
- **Location sharing feedback**: the live line shows relative +
  clock time and ticks while sharing; one missed ping stays
  silent, a second consecutive failure surfaces a retry note
  with a manual "Send an update now" action (`pingFailureStreak`).
  Cadence, throttle and payload unchanged.
- **Every staff control is ≥48px** (Navigate / Call / submit /
  sign-out / retry / quantity and COD controls), and
  `/staff/set-password` panels are glass with the success check
  on its done state.
- **Bundle cost**: `/staff` First Load 110 → 118 kB, task
  detail 118 → 124 kB, `/staff/set-password` 197 kB unchanged;
  the shared 103 kB bundle did not move.

## Hero video — owner's animated film replaces the 3D scene (2026-11-05)

Owner's decision: *"Use this animated video instead of that 3d
models used in main website."* The hero is now the owner's own
supplied animated video; the procedural WebGL scene is retired.

### Changed
- **HeroShowcase is a video showcase**: a portrait (aspect 4/5)
  glass-strong framed card in the hero's visual slot presenting
  `public/hero-shirt.mp4` (720×1280, 10 s loop, ~684 KB, no
  audio) — a pressed white shirt turning slowly on its hanger.
  The server renders the poster frame (`hero-shirt-poster.jpg`)
  as a still; motion-allowed visitors swap to the autoplaying,
  muted, looping `<video>` on mount. The two honest annotation
  chips are retained at the frame's corners; the film is
  decorative (aria-hidden + sr-only description).

### Removed
- **The WebGL hero, entirely**: `HeroScene3D.tsx` and the
  Phase A photo composition `HeroVisual.tsx` deleted (the
  `AnnotationChip` component moved into HeroShowcase, its only
  remaining consumer); the dynamic import, error boundary,
  WebGL detection and hero scroll-progress plumbing removed
  from HeroShowcase.
- **Motion rules that served only the scene**:
  `heroRenderMode`, the hero scroll channel
  (`heroScrollState` / `heroScrollProgress` /
  `heroScrollRotation` + accessors) and the turntable section
  (`turntableAngleAt`, `stackSwayAngleAt` + constants) deleted
  from `src/lib/motion.ts`, replaced in §1 by `heroMediaMode`
  (video vs poster). Tilt, marker-glide, reveal and parallax
  rules are untouched.
- **Dependencies**: `three`, `@react-three/fiber`,
  `@react-three/drei`, `@types/three` uninstalled
  (package.json + lockfile together).

### Rules & verification
- **Reduced motion → poster**: the video element never mounts
  for reduced-motion visitors; `heroMediaMode` is unit-tested.
- Motion suite 76 → 43 assertions (the 33 removed assertions
  are exactly the retired scene rules); full suite 941 → 908,
  all 18 suites green. Production build green; homepage First
  Load JS 118 → 116 kB; a chunk sweep finds no three.js code
  anywhere in the build. Glass ambience, ScrollReveal3D,
  parallax, card tilt and tracking-map motion all remain.

## Hero turntable pass (2026-11-05)

Owner's reference videos: the hero garment on a slow product
turntable — continuous, unhurried, premium.

### Added
- **Turntable rotation** for the hero shirt (`GarmentGroup`
  restructured into stage / shirt / stack groups): one full
  revolution every 28 s (0.224 rad/s) with a 1.5 s velocity
  ease-in from rest. The angle is a pure function of elapsed
  clock time — `turntableAngleAt` in `src/lib/motion.ts` §5 —
  and composes additively with the scroll offset (+0.55 rad
  max), pointer parallax and idle sway on the shirt's Y axis.
- **Stack counter-sway**: the folded stack stays world-anchored
  (no turntable) with a ±0.06 rad counter-drift on a 90 s cycle
  (`stackSwayAngleAt`), pivoting around its own base.
- 15 new unit assertions in `scripts/test-motion.mjs` (suite
  61 → 76; project total 926 → 941, all green). No new
  dependencies; bundle unchanged.

### Unchanged
- All motion gates: frameloop pause off-screen / hidden tab
  freezes the turntable with the clock; reduced-motion keeps
  the static hero (no turntable); WebGL fallback untouched.

## Glass + 3D scroll pass (2026-11-05)

Owner request: "Make my website 3d scrollable and glass effect
background." A frosted-glass ambience and scroll-driven depth
for the public marketing experience. Visual only — no copy,
data, pricing or flow changed. Admin, staff and the customer
task flows (/order, /orders, /dashboard, auth) are untouched.

### Added
- **Ambient backdrop** (`AmbientBackground`, mounted by
  SiteChrome on marketing routes only): fixed pastel wash +
  four pre-softened radial-gradient orbs (sky/teal/blush/mist)
  drifting on 46–58s transform-only loops. No blur filter on
  the full-screen layer; content lifted into a `relative z-10`
  wrapper above it.
- **Glass utilities** in globals.css (inside `@layer utilities`
  so hover shadow variants still win): `.glass`, `.glass-strong`,
  `.glass-chip`, `.glass-dark` — frosted white (blur 14–18px,
  saturate 1.4), `-webkit-` prefixes for iOS Safari, and an
  `@supports not (backdrop-filter…)` near-opaque fallback.
- **`ScrollReveal3D`** (src/components/motion): sections enter
  with a shallow 3D tip (rotateX 10°, +36px, 25% opacity →
  flat, 0.85s), staggered ≤120ms/step capped at 600ms; same
  post-mount-class no-JS safety as `Reveal`.
- **`ParallaxRoot`** (homepage): one passive rAF-throttled
  scroll listener drifting all `[data-parallax]` layers
  (orbs, hero blobs) at 0.05–0.11× scroll, clamped ±480px.
- **Hero scroll response**: HeroShowcase publishes hero scroll
  progress to the `heroScrollState` channel in
  src/lib/motion.ts; the 3D garment turns up to +0.55 rad Y
  (slight X lean) as the hero scrolls away, damped in the
  scene's frame loop.

### Changed
- Glass applied to: header (+ services dropdown), hero fact
  cards and Track button, why / care-process / how-it-works
  cards, service and blog cards, pricing teaser and pricing
  page cards, testimonials, FAQ teaser + FAQ page panels,
  services/pricing hero panels, about value cards, process
  step cards, footer area chips (glass-chip), and the CTA
  band (keeps its navy gradient; content now floats on a
  glass-dark inner card). Homepage section bands went
  translucent (veil gradients, 70% mist/white) so the
  ambience shows through.
- ScrollReveal3D applied across the homepage's major sections
  and the services / pricing / blog hero bands, replacing the
  flat Reveal there (the How It Works steps keep Reveal —
  its data-reveal attribute drives the connector line).

### Rules & verification
- Reduced motion collapses everything: still orbs, no
  parallax, reveals in final state, hero channel at 0.
- New pure rules in src/lib/motion.ts §4 (`scrollMotionEnabled`,
  `heroScrollProgress`, `heroScrollRotation`, channel
  accessors, `revealDelayMs`, `parallaxOffset`,
  `parallaxEnabled`) — 29 new assertions in
  scripts/test-motion.mjs (61 total there); full suite
  897 → 926 passing. Production build green; homepage First
  Load JS 117 → 118 kB (+1 kB), no new dependencies.

## Phase 5 realism pass — product-render hero (2026-11-05)

Owner verdict on the Scope M scene: "that 3d shirt is looking
like cartoon." The flat extruded silhouette + flat lighting
were the cause; both were rebuilt. Composition, capability
gate, fallback matrix, lazy-chunk discipline and the
performance contract are unchanged.

### Changed
- **Lighting** — image-based lighting from a locally generated
  `RoomEnvironment` (PMREM) replaces the ambient wash; one key
  directional remains for definition. ACES tone mapping,
  exposure 1.06, sRGB output pinned in `onCreated`.
- **Torso** — the flat extrusion is replaced by parametric
  front/back cloth panels (spline width profile with waist
  taper, depth fullness, shirttail hem, scooped neckline)
  closed by bulged seam strips; drape undulations and
  micro-wrinkles are displaced into the vertices, and the
  placket is a raised strip with stitch grooves displaced
  into the surface itself. Buttons (now glossy pearl domes)
  and the pocket are seated from the same surface functions.
- **Sleeves** — straight angled cylinders replaced by tapered
  tubes swept along drooping CatmullRom curves with a slight
  forward bend, shoulder caps, cuff bands, cuff buttons and
  shadowed sleeve openings. Collar band now leaves a genuine
  front gap for the open V, with a shadowed neck interior.
- **Fabric** — a canvas-drawn plain-weave pattern now feeds
  bump + roughness maps on every cloth material (stack
  included); sheen retuned, v1 clearcoat sheen nearly removed.
- **Stage** — painted blue-grey studio backdrop (canvas
  gradient + light pool) behind the garments; particles
  110 → 55 and faded; contact shadows softer; the folded
  stack gains a folded-over top flap and larger corner radii.
- **Assets** — still 100% procedural: geometry, weave,
  backdrop and environment are all generated at runtime.
  No models, no image textures, no downloads.

### Performance
- Lazy 3D chunks: 956,869 → 965,794 raw bytes (+8.9 kB,
  +0.9%); the three/drei vendor chunks are byte-identical.
  `/` First Load JS unchanged at 117 kB. Full suite:
  897 passed, 0 failed (no test changes — no new pure logic
  was extracted).

## Phase 5 — 3D experience, Scope M (2026-11-05)

### Added
- **3D hero (homepage only)** — `HeroScene3D` (three +
  @react-three/fiber + @react-three/drei): a stylised real-time
  interpretation of the owner's reference board. One pristine
  white dress shirt floats upright (extruded silhouette, collar
  band + leaves, buttoned placket, angled long sleeves, chest
  pocket; pearlescent cloth via sheen + clearcoat physical
  materials) beside a folded-garment stack, on a pastel studio
  stage with a pedestal glow, contact shadows, sparse particles,
  slow levitation and damped pointer-parallax. **All geometry is
  procedural — no model files, no textures, no external assets.**
- **Capability gate** — `HeroShowcase` + `heroRenderMode`
  (`src/lib/motion.ts`): the static Phase A composition remains
  the default and the fallback for reduced-motion visitors,
  WebGL-less devices, chunk loading, and any scene error
  (error boundary + Canvas `onError`).
- **Card tilt** — `ServiceCard` wrapped in
  `src/components/motion/Tilt.tsx`: fine-pointer CSS 3D tilt
  (±8° clamp) + sheen sweep; disabled for coarse pointers and
  reduced motion; focus behaviour unchanged.
- **Tracking motion** — the rider marker glides ~1 s between
  the previous and newest RECORDED positions
  (`planMarkerTransition` / `markerPositionAt`), snapping for
  first fixes, sub-metre steps, >1.5 km jumps and reduced
  motion; the OSRM route line draws on when new geometry
  appears; the rider pin pulses only in the LIVE state.
- **Tests** — `scripts/test-motion.mjs` (32 assertions: hero
  mode matrix, tilt geometry/clamps, glide planning, easing and
  interpolation bounds), wired in as `test:motion`. Full suite:
  897 passed, 0 failed (865 baseline untouched).

### Performance
- three.js ships in five lazy chunks bound to
  `HeroShowcase.tsx -> ./HeroScene3D` in the loadable manifest;
  verified that **no route's initial bundle** (104 checked)
  contains any of them. First Load JS: `/order` 140 kB,
  `/dashboard` 136 kB, `/orders/[id]` 200 kB — all unchanged;
  `/` 107 → 117 kB (showcase/tilt/motion code only). Canvas is
  pointer-events:none, DPR-capped (≤2, ≤1.5 small screens), and
  its render loop pauses off-screen / on hidden tabs.

## Geocode fallback ladder + tracking-feed healing (2026-11-05)

Fixed the destination pin that never appeared: the geocoder
asked Nominatim one full-address question, and Nominatim has no
street- or area-level coverage for Bokaro (verified live — even
"Sector 4, Bokaro Steel City, 827004" returns []), so effectively
every real address geocoded to null and the customer map had no
destination, distance or ETA.

### Fixed
- **Fallback ladder** (`buildGeocodeLadder` /
  `resolveGeocodeLadder` in `src/lib/tracking.ts`): full address
  → area → pincode → city, deduped, first hit wins, with the
  winning precision (`address` / `area` / `pincode` / `city`)
  carried on the result and logged server-side on every hit.
  Pincodes DO resolve (827004 → 23.6687, 86.1488), so a Bokaro
  pin now lands at pincode precision — the customer's area,
  honestly an estimate for distance/ETA purposes (README,
  Phase D: "Destination pin precision — said plainly").
- **Backfill-on-read**: `GET /api/tracking/[orderId]` runs the
  ladder once (awaited, 3 s per-request timeout, best-effort)
  when the order's address has no coordinates yet, and persists
  the hit — healing addresses created before the ladder and any
  background geocode that was lost. Once coordinates exist the
  branch never runs again for that address.
- **`scheduleGeocode` now uses Next's `after()`**: the previous
  bare un-awaited promise could be frozen by Vercel the moment
  the response was sent. Route latency is unchanged; the
  platform now keeps the invocation alive until the walk ends.

### Tests
- `scripts/test-tracking.mjs` gains 27 assertions: ladder order
  and exact query strings, dedupe (blank line collapses the
  address/area rungs; missing parts skip their rungs), first-hit
  wins and stops the walk, the Bokaro pattern (address + area
  miss → pincode hit), all-miss → null, precision labels, and
  malformed/garbage rungs ignored end-to-end through the real
  response parser. Full suite: 865 passed, 0 failed;
  `next build` green.

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
