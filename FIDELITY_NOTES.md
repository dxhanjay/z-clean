# Laundra fidelity notes — Delta 3 (2026-11-05)

Comparison of the Z-clean homepage against the design reference at
https://laundra.webflow.io, made by reading the reference's rendered
page and this codebase side by side. **Design/flow alignment only:**
no text, statistics, testimonials, or imagery were copied from the
reference — the only reference assets on the site remain the template
photos already hotlinked in `src/lib/media.ts` before this delta.

## Section inventory

| # | Laundra (reference) | Z-clean before Delta 3 | Z-clean after Delta 3 |
|---|---|---|---|
| 1 | Header: logo, nav (Services, Pricing, How it works, About, FAQ, Contact-style), phone, CTA | Same shape; nav without Blog | Blog added to nav (desktop gap tightened); otherwise unchanged |
| 2 | Hero: oversized headline, one-line pitch, dual CTA ("Watch how we work" + primary), 3-photo slider | Two-column hero, headline at text-4xl/5xl, dual CTA, 3-photo slider | Headline stepped up to text-5xl/6xl; dual CTA kept (Schedule a Pickup / See How It Works); slider unchanged |
| 3 | — (no trust strip as such; social proof sits in testimonials) | — | **New trust strip** under the hero: areas served, free pickup ≥ ₹299, regular & express, pay online/on delivery — service FACTS, not volumes |
| 4 | Services name marquee | Present (services marquee) | Unchanged |
| 5 | About: 3-photo collage + belief statement | 3-photo collage + story copy | Eyebrow + heading scale aligned; copy unchanged |
| 6 | Why Choose Us: large image + three NUMBERED statements (01/02/03) with service tag chips | Image + 4 unnumbered cards | Cards numbered 01–04 in the reference's manner; chips NOT copied (they list the reference's services) |
| 7 | Services: 3 large alternating photo cards | 8-card grid, photos on 3 cards | Grid kept (we have 8 real services, not 3); card treatment (photo zoom, shadow lift) already matched and kept |
| 8 | How It Works: 4 steps, numbered, connector line, photo cards | Same structure (connector line + photos + numbers) | Eyebrow + heading scale aligned |
| 9 | (No separate process section) | 6-stage care process section | Kept — it is Z-clean's own operational truth (mirrors order stages) |
| 10 | (No pricing section on the reference homepage) | — | **New pricing teaser**: 6 highlight rates from the live catalogue + the real terms (min ₹199, free pickup ≥ ₹299, express 1.5×) |
| 11 | Testimonials: quote slider with portraits, names, company logos | — (deliberately absent: no real reviews existed) | **New**: approved reviews from the real reviews system; section hides itself while empty |
| 12 | Blog: "Our Blogs" card row | — | **New**: latest 3 of the site's own articles + /blog pages |
| 13 | (No FAQ section on the reference homepage) | — | **New FAQ teaser** (first 4 of lib/faqs) — kept from our own IA; the reference's /faq equivalent is a page, ours now teases on home too |
| 14 | CTA band: bold statement + CTA | Brand band, dual CTA | Unchanged |
| 15 | Footer: brand, service links, company links, contact | 4 columns (brand, services, company, contact) | Blog link added; opening hours when configured; **new "Areas we serve" strip** — 13 areas with pincodes |

## Rhythm/typography changes

- One section scale everywhere on the homepage: padding
  `py-16 sm:py-20`, headings `text-3xl sm:text-4xl` under a small
  uppercase brand eyebrow (the reference's label-above-heading
  pattern), grid gaps normalised to `mt-10` below headings.
- The why-choose-us band follows the about band without double
  padding (bottom-only padding) so the two read as one movement.
- Scroll reveal: already unified in `src/components/Reveal.tsx`
  (IntersectionObserver, once, reduced-motion safe, no-JS visible) —
  the new sections (pricing, testimonials, blog, FAQ) all use it, so
  no second animation system was introduced.
- Performance posture kept: hero first slide stays `eager` +
  `fetchPriority=high`, everything else lazy; no layout-shift
  sources added (sections reserve their grids; the testimonials
  section's absence/presence is a server-render decision, not a
  client-side pop-in).

## Deliberately NOT mimicked

1. **Reference testimonials** — names, quotes, portraits, and the
   company-logo row are the template's fiction. Ours come only from
   the reviews table (delivered orders + staff approval), and the
   section is absent until the first real approval.
2. **Volume/social-proof claims** — the reference's CTA ("Join
   thousands who trust…") and any stat-style bands. Z-clean has no
   verified volumes to quote; the trust strip uses service facts
   instead.
3. **"Watch how we work" video CTA** — there is no Z-clean video to
   watch; the slot is our "See How It Works" page link.
4. **Eco/premium detergent claims** in the reference's step copy —
   unverified for this business; our step copy describes the actual
   staged process instead.
5. **The reference's 3-service showcase** — Z-clean really offers 8
   services; shrinking the grid to imitate the template would hide
   real offerings.
6. **Reference blog imagery/posts** — our three articles are
   original, with covers drawn only from the imagery already in
   `media.ts`.

---

# Phase A — Premium redesign (CleanPro references, 2026-11-05)

The owner supplied three CleanPro concept screenshots and asked for
that visual language on the customer website. Only the LANGUAGE was
adopted — pastel palette, floating garment composition, oversized
rounded cards — never the reference's brand, copy, prices, or
claims. The Delta 3 section order, data sources and facts are
unchanged; this pass is chrome and composition only.

## Design system additions (globals.css)

- Pastel scale `mist-50…400` (#f6fafc → #a8c4de) + `navy-800/900/950`
  aliases (ink-900 remains the heading navy). Brand teal untouched
  and still the action accent everywhere.
- Soft shadow scale `shadow-soft-sm / soft / soft-lg / soft-xl`
  (blue-grey, diffuse) — the floating-card elevation system.
- `.bg-pastel-hero` (sky→white 155° wash), `.bg-pastel-band`
  (mist→white), `.glass-panel` (translucent white + blur).
- `.zc-float` / `.zc-float-slow` levitation keyframes
  (transform-only, alternate, disabled under
  `prefers-reduced-motion`, alongside every older animation).
- Card recipe used across the storefront: `rounded-[2rem] bg-white
  shadow-soft ring-1 ring-mist-200/70`, hover lift on link cards.

## Per-page changes

| Surface | Change |
|---|---|
| Header | Glassy translucent sticky bar (white/85 + blur, mist border). Nav is now: Services ▾ dropdown (all 8 real services + unit labels, "View all services / How it works" footer), Pricing, Blog, Track (→ /dashboard), Help (→ /faq); pill **Get the App** button → new `/app` page. Mobile strip mirrors the same destinations + About/Contact. The old header "Schedule Pickup" button moved out — the hero + CTA band carry that action. |
| `/app` (new) | Honest download page: Android card links to the project's stable Expo builds page; iOS card says the App Store release is being prepared and points to the web app (no dead store badge). Three real app-capability points (stage tracking, QR/OTP codes in pocket, quick booking). |
| Home hero | Rebuilt: pastel gradient with soft halo blobs; owner's headline "The New Level of Care for Your Wardrobe" (Care in brand teal); original support copy; dual CTA — Schedule a Pickup (primary) + Track Your Order (glass). Right: new `HeroVisual` floating composition (main garment photo levitating, overlapping handover photo card, folded-laundry glass chip, two annotation chips with honest care lines: "Tough stain? We treat it with care" / "Every garment inspected by hand"). The rotating `HeroSlider` was removed. Trust strip restyled as four glass fact cards — same computed facts as Delta 3. |
| Home sections | Marquee recolored to mist/navy. About collage: rounded-[2rem] + soft shadows. Why-choose-us: pastel band, white floating numbered cards, image card rounded/shadowed. Services: new async `HomeServices` grid — `ServiceCard` is now a floating garment card (coloured droplet corner tab; gradient initial band for services without a photo) showing **"From ₹X" from the live catalogue** (lowest rate per service; omitted if a service has no priced items). How-it-works: mist band, floating step cards, mist connector line. Care process: floating cards. Pricing teaser: mist band + floating table card. Testimonials: floating white cards (logic untouched — still approved reviews only, hidden while empty). Blog: mist band + floating cards. FAQ teaser: questions inside one floating white card. CTA band: navy→brand gradient. |
| Services index | Pastel hero panel for the heading; restyled `ServiceCard` grid (no price line — the index doesn't load the catalogue, as before). |
| Service detail | Hero band: pastel panel containing the photo (rounded-[2rem], soft shadow), title and description; "Good to know" is now a floating white card. Copy/data unchanged. |
| Pricing | Pastel heading panel; the approved-list banner and each price group are floating white cards; term cards likewise. All prices still DB-first via `loadStorefrontCatalogue`; page remains `force-dynamic`. |
| Dashboard | The three action cards and both `DashboardPanels` sections/items use the floating-card recipe. |
| Dashboard orders | `OrdersSection` cards rebuilt in the reference's garment-card shape: photo header (the site's folded-laundry photo — decorative; the list API carries counts, not per-item photos) with a glass status chip, order reference, real item quantities ("N items in M lines"), pickup line, order date and total. Data flow and APIs unchanged. |
| Order detail | Chrome only: all eight card containers (incl. timeline + review form containers and the loading skeletons) use the floating-card recipe; demo banner radius aligned. Timeline, QR/OTP codes, payments, retry and review behaviour are byte-identical. |
| Footer | Mist background/borders, soft-shadow area chips, new "Get the app" link. Structure and data unchanged. |

## Deliberately NOT adopted from the references

1. **Star-rating rows, avatar clusters, "5k+" / "2.7k+" counts** —
   fabricated social proof. The hero trust row carries service facts
   only; the only stars anywhere remain inside real approved
   customer reviews in Testimonials.
2. **"Guaranteed stain removal"** annotation copy — the chip says
   "We treat it with care" because that's what's true.
3. **Reference prices, order refs and the NYC map** — ours are ₹
   catalogue prices and our own order references; live map tracking
   is a separate later phase, not part of this redesign.
4. **Admin panel** — untouched (Gentelella stays separate), and
   `mobile/` was not touched in this phase.

## Phase D note — the live map (2026-11-05)

The redesign's tracking references show a polished map panel with
a route and a driver marker. What shipped in Phase D keeps the
*shape* (a large rounded map card on the order page, rider/driver
chips, a stage rail) and replaces every pictured datum with a real
one:

- **Map imagery**: live OpenStreetMap tiles centred on the order's
  own Bokaro Steel City geography. The reference's NYC map, its
  route and its pins were not copied, and no stock/screenshot map
  image is used anywhere — when there is no live leg, there is no
  map at all.
- **The rider marker** sits on the last position the assigned
  rider's phone genuinely reported via the staff web app. It is
  never advanced along the route or projected forward; a stale
  position is labelled with its last-seen time instead.
  *(Phase 5 amendment: when a NEW genuine report arrives, the
  marker now glides between the two recorded positions over
  ~1 s as a purely visual transition — it still never goes
  beyond the newest report, and it snaps instead of gliding
  for first fixes, long jumps, and reduced-motion visitors.
  See the Phase 5 note below.)*
- **The route line and "Estimated arrival"** come from the OSRM
  public router for that exact rider position and the customer's
  geocoded address, and are shown only when OSRM returns them —
  the reference's always-present ETA graphic has no counterpart
  when the data isn't there.
- **The 12-stage rail** mirrors the references' stage-list shape,
  but every stage lights from Z-clean's own lifecycle, assignment
  and handover records — including the documented drying
  derivation (drying completes with the plant's single Processing
  handover; it is never staged as a step the data can't see).

## Phase 5 note — the 3D hero (2026-11-05)

The owner's reference board (received during the Phase 5 build)
shows a pristine white dress shirt floating upright over a
folded stack in a cool blue-grey studio. What shipped is a
stylised **real-time interpretation** of that board, not a copy
of any asset in it:

- **The shirt is procedural geometry** — an extruded front
  silhouette with a collar band and leaves, a buttoned placket,
  angled sleeves and a pocket, in pearlescent cloth materials
  (sheen + clearcoat). The folded stack is rounded slabs in the
  site's own pastel palette. No model file, photo, or texture
  from the reference (or anywhere else) is used; the only
  generated textures are runtime canvas gradients.
- **The stage matches the site's own hero**, not the board's
  studio: the canvas is transparent over the existing pastel
  gradient, grounded by a soft pedestal glow and contact
  shadows.
- **Motion follows the board's mood, not its letter**: slow
  levitation, a gentle sway and pointer-parallax instead of any
  copied animation, and only for visitors who can run WebGL and
  have not asked for reduced motion — everyone else keeps the
  Phase A photo composition, unchanged.
- The reference's other garments (hoodies, hanging rails) were
  deliberately not reproduced: the board's hero is ONE shirt,
  and the scene keeps that single, readable hero object.

*(Realism-pass amendment, same day: the owner's verdict on the
scene above was "cartoon", so the shirt and stage were rebuilt
toward the board's product-render mood — the extrusion became
parametric cloth panels with baked drape, the sleeves swept
tubes, the cloth gained a procedural weave, lighting became
image-based (a locally generated environment, still no
external assets), and the stage is now a painted blue-grey
studio backdrop in the board's spirit rather than the site's
pastel gradient. The interpretation-not-copy position above
is unchanged: every asset remains procedural and original.)*
