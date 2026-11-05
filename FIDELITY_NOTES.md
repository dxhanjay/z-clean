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
