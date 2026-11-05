import type { SiteImage } from "../lib/media";
import { heroImages, serviceImages } from "../lib/media";

/**
 * Z-clean blog (Delta 3) — original articles, written for this site.
 *
 * Content rules (integrity): garment-care advice is general knowledge;
 * every statement about Z-CLEAN ITSELF uses only facts that are true
 * on this site — the services in src/lib/services.ts and the approved
 * prices in src/lib/pricing.ts. No invented statistics, awards,
 * customer stories or "thousands of customers" claims, ever. Prices
 * mentioned are the approved Bokaro Steel City rates; if the admin
 * panel changes a rate, update the article in the same change.
 *
 * Rendering: bodies are structured blocks (paragraph / heading /
 * list) rendered by src/components/BlogBody.tsx — no markdown
 * dependency, no raw HTML from content.
 */

export type BlogBlock =
  | { type: "paragraph"; text: string }
  | { type: "heading"; text: string }
  | { type: "list"; items: string[] };

export interface BlogPost {
  slug: string;
  title: string;
  excerpt: string;
  /** ISO date (yyyy-mm-dd), displayed in en-IN format. */
  date: string;
  readingMinutes: number;
  cover: SiteImage;
  tags: string[];
  /** Slug of the related service page, linked from the article. */
  serviceSlug: string;
  body: BlogBlock[];
}

export const blogPosts: BlogPost[] = [
  {
    slug: "silk-saree-festive-wear-care",
    title: "Silk Sarees & Festive Wear: Care Before, During and After the Celebrations",
    excerpt:
      "Silk, zari and embroidery are at their best — and their most vulnerable — during the festive and wedding season. How to wear, rescue and store them so they come out next year looking the same.",
    date: "2026-11-10",
    readingMinutes: 5,
    cover: serviceImages["dry-cleaning"],
    tags: ["Dry cleaning", "Saree care", "Festive wear"],
    serviceSlug: "dry-cleaning",
    body: [
      {
        type: "paragraph",
        text: "A silk saree is rarely just a garment. It is the one your mother handed down, the one bought for a wedding, the one that only comes out a few times a year — which is exactly why festive season is when silk gets damaged. Sweat, perfume, food spills, and then months of storage in whatever state it was folded away. Most of that damage is preventable with a little care at the right moments.",
      },
      { type: "heading", text: "Why silk should stay away from water" },
      {
        type: "paragraph",
        text: "Silk fibres weaken when wet, and many silk dyes are not fully water-fast: a home wash can leave water marks, tide lines and patchy colour that no later treatment fully reverses. Zari — the metallic thread in borders and butis — has its own enemy list: moisture, sweat and perfume all tarnish it. This is why care labels on silk almost always say dry clean only. It is not caution for its own sake; the solvent-based process cleans without soaking the fibres.",
      },
      { type: "heading", text: "Before you wear it" },
      {
        type: "list",
        items: [
          "Air the saree in shade for a few hours after taking it out of storage — never in direct sun, which fades silk.",
          "Check for old stains now, not later. A mark that went into storage unnoticed has had months to set; point it out when you book a clean so it gets pre-treatment.",
          "Test the blouse piece's colour separately if it is a contrast fabric — borders and blouses sometimes behave differently.",
        ],
      },
      { type: "heading", text: "While you are wearing it" },
      {
        type: "list",
        items: [
          "Apply perfume, deodorant and hair spray before you drape, and let them dry. Sprayed directly onto silk or zari, they spot and tarnish.",
          "Blot spills immediately with a clean dry cloth — never rub, and do not apply water or home stain removers to silk. Blot, and let the cleaner handle the rest.",
          "Keep an eye on the pallu and lower border around food; turmeric and oil are the two most common festive stains, and both respond far better when treated within days, not months.",
        ],
      },
      { type: "heading", text: "After the event: clean first, then store" },
      {
        type: "paragraph",
        text: "The single most valuable habit: never store a worn silk unwashed. Sweat and invisible food splashes oxidise in storage, turn yellow, weaken the fibres and attract insects — the stain you cannot see in November is the hole you find next year. Air the saree for a day after wearing, then have it dry cleaned before it goes away.",
      },
      {
        type: "list",
        items: [
          "Store in a clean cotton or muslin wrap, not plastic — silk needs to breathe, and plastic traps moisture.",
          "Refold along different lines every few months; silk creases permanently along a fold left for years, especially under zari.",
          "Keep storage dry and dark. Camphor and neem are traditional for a reason, but keep them from touching the fabric directly.",
        ],
      },
      { type: "heading", text: "Lehengas, sherwanis and suits" },
      {
        type: "paragraph",
        text: "The same rules scale up. Embellished lehengas and sherwanis should be inspected piece by piece before cleaning — loose stones, sequins and latkans need to be noted so the finish protects them — and heavy suits should be cleaned before storage so moths are not invited to a meal. At Z-clean, dry cleaning is priced per piece: a plain or cotton saree is ₹199, a heavy, silk or embroidered saree is ₹299, a 2-piece suit is ₹299 and a sherwani is ₹449. Every garment is inspected and its care label followed; if a piece needs handling beyond the standard clean, we confirm with you before doing anything — and nothing is stored away 'for later' on our side, it comes straight back to you ready for your cupboard.",
      },
    ],
  },
  {
    slug: "wash-fold-vs-wash-iron-vs-dry-cleaning",
    title: "Wash & Fold, Wash & Iron or Dry Cleaning? How to Choose",
    excerpt:
      "Three services, three different jobs. A plain-English guide to what each one actually does, what it costs, and how to route every pile of laundry to the right one.",
    date: "2026-11-06",
    readingMinutes: 5,
    cover: serviceImages["laundry-wash-and-fold"],
    tags: ["Laundry basics", "Pricing", "Guides"],
    serviceSlug: "laundry-wash-and-fold",
    body: [
      {
        type: "paragraph",
        text: "Most laundry confusion is a vocabulary problem. Wash & fold, wash & iron and dry cleaning sound interchangeable, but they are three different treatments with three different price logics — and sending a garment to the wrong one either wastes money or risks the garment. Here is how to tell them apart.",
      },
      { type: "heading", text: "Wash & Fold — the everyday workhorse" },
      {
        type: "paragraph",
        text: "Your clothes are machine-washed with water and detergent, fully dried, and folded neatly for the drawer. It is priced by weight — at Z-clean, ₹70 per kg — because everyday laundry (tees, home wear, towels, bed linen, kids' clothes) is naturally a by-the-bagful problem. If it is cotton or a sturdy synthetic, carries no 'dry clean only' label, and you want it back clean and folded rather than presentation-ready, this is its service.",
      },
      { type: "heading", text: "Wash & Iron — the wardrobe rotation" },
      {
        type: "paragraph",
        text: "The same wash, plus professional steam pressing, so pieces come back ready to hang and wear — office shirts, trousers, school uniforms, the weekly rotation. Also priced by weight, ₹110 per kg. Choose it when the wash is only half the job and the creases are the other half. If your clothes are already clean and only need pressing, skip the wash entirely: a press-only service (from ₹15 per piece at Z-clean) exists for exactly that.",
      },
      { type: "heading", text: "Dry Cleaning — for what water would harm" },
      {
        type: "paragraph",
        text: "Dry cleaning cleans with solvent instead of water, for garments that water can shrink, fade, misshape or mark: suits and blazers, silk sarees and blouses, lehengas and embellished festive wear, woollens, and anything whose care label says so. It is priced per piece — a dry-clean shirt is ₹80, a 2-piece suit ₹299 — because each garment is individually inspected, spot-treated, cleaned and finished by hand.",
      },
      { type: "heading", text: "A routing rule that covers almost everything" },
      {
        type: "list",
        items: [
          "Care label says 'dry clean only' → dry cleaning. The label outranks every other rule.",
          "Structured, lined, embellished or silk/wool → dry cleaning.",
          "Everyday cotton and synthetics you wear on rotation → wash & iron if you want them pressed, wash & fold if you don't.",
          "Already clean, just creased → press-only.",
          "Unsure about one piece? Book the bulk as laundry and flag the doubtful item at pickup — inspection sorts every item by fabric and label anyway, and special handling is confirmed with you before it happens.",
        ],
      },
      { type: "heading", text: "What it means for the bill" },
      {
        type: "paragraph",
        text: "By-weight services reward full loads; per-piece services reward being selective. A typical weekly family wash routes most of the bag to wash & fold or wash & iron and only the two or three good pieces to dry cleaning — which is both the safest and the cheapest split. Two honest numbers to plan around: Z-clean's minimum order is ₹199, and pickup and delivery are free on orders of ₹299 or more (₹40 below that). Where express turnaround is offered it is priced at 1.5× and always shown before you book, never added afterwards.",
      },
    ],
  },
  {
    slug: "monsoon-laundry-guide",
    title: "The Monsoon Laundry Guide: Beating Damp, Musty Smells and Slow Drying",
    excerpt:
      "Weeks of Jharkhand rain, no sun for days, and laundry that never quite dries — the monsoon is when clothes go musty and wardrobes start to smell. What actually works.",
    date: "2026-11-02",
    readingMinutes: 5,
    cover: heroImages[2],
    tags: ["Monsoon", "Home laundry", "Fabric care"],
    serviceSlug: "laundry-wash-and-fold",
    body: [
      {
        type: "paragraph",
        text: "Every monsoon in Bokaro the pattern repeats: rain for days, humidity that never drops, and a house where laundry dries slowly if it dries at all. The musty smell that follows is not the washing's fault — it is mildew, and it starts growing on fabric that stays damp for a day or two. The good news is that the fix is mostly about time and airflow, not products.",
      },
      { type: "heading", text: "Rule one: nothing stays wet and waiting" },
      {
        type: "list",
        items: [
          "Never leave a finished wash sitting in the machine, or wet clothes balled in a basket. Damp, warm, airless is exactly what mildew wants — hang things within the hour.",
          "Sweaty and rain-soaked clothes should not go straight into a closed laundry hamper. Air them on a hook or railing first, even if the wash happens a day later.",
          "Smaller, more frequent loads beat one giant weekly load in the rains: a smaller load spins drier and dries faster.",
        ],
      },
      { type: "heading", text: "Drying indoors, done properly" },
      {
        type: "list",
        items: [
          "Use the highest spin your fabrics allow — water you spin out is water that does not have to evaporate in your room.",
          "Space garments on the rack with gaps between them; a crowded rack dries the outside pieces and keeps the inside ones damp.",
          "Put the rack where air moves — under a ceiling fan or near a window. A fan running over a rack for a few hours does more than a full day in a still, closed room.",
          "Turn heavy items (jeans, hoodies, towels) inside out halfway through, and move the thickest seams and waistbands into the airflow.",
          "Only put clothes away when they are completely dry — 'almost dry' folded into a closed cupboard is where the musty wardrobe smell is born.",
        ],
      },
      { type: "heading", text: "Rescuing clothes that already smell musty" },
      {
        type: "paragraph",
        text: "A musty garment needs a re-wash, not a perfume spray — fragrance over mildew just gives you both smells. Re-wash with a full rinse, dry it completely with moving air this time, and if the fabric tolerates it, finish with a hot iron: heat helps kill the residual odour. Towels and bed linen are the usual repeat offenders because they are thick and get folded away first; in the wettest weeks, rotate two sets hard rather than keeping a deep bench of spares sitting damp-prone in the cupboard.",
      },
      { type: "heading", text: "Shoes, bags and the corners of the cupboard" },
      {
        type: "list",
        items: [
          "Shoes that got rained on: stuff with newspaper, air under a fan, and never closet them wet — leather especially can spot and crack after a damp storage.",
          "Open wardrobes on dry afternoons to let the air change; a cupboard sealed through the whole monsoon will smell like it.",
          "Leather bags and jackets should be checked during the season — surface mould wipes off easily early and becomes a specialist job late.",
        ],
      },
      { type: "heading", text: "When the weather wins, outsource the drying" },
      {
        type: "paragraph",
        text: "There is no virtue in fighting a fortnight of rain with a balcony. This is the season Z-clean's wash & fold quietly earns its keep: your laundry is washed, fully dried — completely, not almost — and folded before it is packed, so nothing comes back damp or musty, and the same applies to curtains and carpets, which are dried fully before return. It is charged by weight at ₹70 per kg, collected from and delivered back to your door across our Bokaro Steel City service areas, so the rainy-day trip to a laundromat is also off your list.",
      },
    ],
  },
];

export function getBlogPost(slug: string): BlogPost | undefined {
  return blogPosts.find((p) => p.slug === slug);
}

/** Newest first (posts are dated Nov 2026, staggered). */
export function latestBlogPosts(count: number): BlogPost[] {
  return [...blogPosts]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, count);
}

/** "10 Nov 2026" from an ISO date, without timezone drift. */
export function formatBlogDate(isoDate: string): string {
  const parsed = new Date(`${isoDate}T00:00:00+05:30`);
  return parsed.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });
}
