/**
 * Z-clean services catalogue (typed source for the public site).
 *
 * This mirrors the `services` table seed in supabase/schema.sql. Prices are
 * deliberately NOT included: the real price list is pending owner input and
 * lives in the `price_items` table (integer paise), editable from the admin
 * panel. `pricingUnit` is the unit a price will be quoted in, not a price.
 */

export type PricingUnit = "kg" | "piece" | "pair" | "sqft";

export interface Service {
  slug: string;
  name: string;
  /** Short line used on cards. Original Z-clean copy. */
  shortDescription: string;
  /** Longer copy for the service detail page. Original Z-clean copy. */
  longDescription: string;
  pricingUnit: PricingUnit;
  /** Human-readable label for the unit, e.g. "per kg". */
  unitLabel: string;
  /** What the customer should know before booking. */
  goodToKnow: string[];
}

export const services: Service[] = [
  {
    slug: "laundry-wash-and-fold",
    name: "Laundry Wash & Fold",
    shortDescription:
      "Everyday laundry washed, dried and neatly folded, ready to put away.",
    longDescription:
      "Send us your everyday laundry and get it back washed with care, fully dried and folded in tidy stacks. Loads are washed separately for each customer, sorted by colour and fabric before they go in, so your clothes come back exactly as yours — clean, fresh and easy to unpack.",
    pricingUnit: "kg",
    unitLabel: "per kg",
    goodToKnow: [
      "Charged by weight, weighed transparently at pickup",
      "Coloured and white loads are washed separately",
      "Tell us about allergies or detergent preferences when you book",
    ],
  },
  {
    slug: "wash-and-iron",
    name: "Wash & Iron",
    shortDescription:
      "Wash, dry and a crisp finish — shirts, trousers and daily wear, ready to wear.",
    longDescription:
      "The full treatment for clothes you wear on rotation: a careful wash followed by pressing, so each piece comes back ready to hang straight in your wardrobe. A good pick for office wear, school uniforms and weekly family laundry you want back without a crease out of place.",
    pricingUnit: "kg",
    unitLabel: "per kg",
    goodToKnow: [
      "Charged by weight — weighed transparently at pickup, then washed and pressed",
      "Hanger or folded finish — your choice at booking",
      "Delicate items are flagged during inspection and handled separately",
    ],
  },
  {
    slug: "dry-cleaning",
    name: "Dry Cleaning",
    shortDescription:
      "Gentle specialist care for suits, silks, sarees and garments that can't go in a wash.",
    longDescription:
      "Some garments should never meet a washing machine. Our dry cleaning service is built for suits, blazers, silk sarees, lehengas, woollens and embellished pieces: each item is inspected, spot-treated where needed, cleaned with fabric-appropriate methods and finished by hand so it keeps its shape, colour and fall.",
    pricingUnit: "piece",
    unitLabel: "per piece",
    goodToKnow: [
      "Care labels are followed for every single garment",
      "Embellished and delicate pieces are inspected before cleaning",
      "If an item needs special handling, we confirm with you first",
    ],
  },
  {
    slug: "steam-iron-press",
    name: "Steam Iron / Press",
    shortDescription:
      "Just the finish: steam pressing that takes out creases without a full wash.",
    longDescription:
      "Already washed your clothes but hate ironing? Hand them over for steam pressing only. Garments are pressed by type — crisp collars and sleeves for shirts, sharp creases for trousers, gentle steam for fabrics that scorch easily — and returned ready to wear.",
    pricingUnit: "piece",
    unitLabel: "per piece",
    goodToKnow: [
      "Press-only service for pre-washed garments",
      "Steam finish is gentler on delicate fabrics than a hot iron",
      "Let us know if you prefer hangers or folded packing",
    ],
  },
  {
    slug: "shoe-cleaning",
    name: "Shoe Cleaning",
    shortDescription:
      "Deep cleaning for sneakers, sports shoes and everyday footwear, inside and out.",
    longDescription:
      "Shoes collect more than visible dirt. Our shoe cleaning covers uppers, soles, laces and insoles, with methods matched to the material — canvas and mesh are treated differently from suede or leather. Pairs come back freshened, deodorised and ready for the rack.",
    pricingUnit: "pair",
    unitLabel: "per pair",
    goodToKnow: [
      "Methods are matched to material: canvas, mesh, suede or leather",
      "Laces and insoles are cleaned, not just the uppers",
      "Heavy restoration or repair is quoted separately after inspection",
    ],
  },
  {
    slug: "leather-care",
    name: "Leather Care",
    shortDescription:
      "Specialist cleaning and conditioning for leather jackets, bags and accessories.",
    longDescription:
      "Leather needs feeding, not just cleaning. Our leather care service cleans jackets, bags, wallets and other leather goods with products made for the material, then conditions them so the finish stays supple instead of drying out or cracking after a clean.",
    pricingUnit: "piece",
    unitLabel: "per piece",
    goodToKnow: [
      "Every leather item is assessed before treatment begins",
      "Conditioning is included to protect the finish after cleaning",
      "Colour touch-ups, if needed, are quoted after inspection",
    ],
  },
  {
    slug: "curtain-cleaning",
    name: "Curtain Cleaning",
    shortDescription:
      "Curtains and drapes cleaned and finished, so rooms feel lighter again.",
    longDescription:
      "Curtains quietly gather dust, cooking smells and city grime. We clean curtains, drapes and sheers with methods suited to their fabric and lining, then finish them so they hang well. Measure or count your panels before booking and we will handle the rest at pickup.",
    pricingUnit: "piece",
    unitLabel: "per piece / per kg by fabric",
    goodToKnow: [
      "Suitable for lined, unlined and sheer curtains",
      "Hooks and rings are kept together with each panel",
      "Very heavy drapes may be weighed instead of counted — confirmed at pickup",
    ],
  },
  {
    slug: "carpet-cleaning",
    name: "Carpet Cleaning",
    shortDescription:
      "Rugs and carpets deep-cleaned to lift ground-in dust and everyday stains.",
    longDescription:
      "Carpets and rugs hold on to dust long after vacuuming stops helping. Our carpet cleaning works through the pile to lift embedded dirt and treat everyday stains, then dries the piece fully before it is rolled and returned, so nothing comes back damp or musty.",
    pricingUnit: "sqft",
    unitLabel: "per sq ft",
    goodToKnow: [
      "Priced by area — measure length × width before booking",
      "Pieces are fully dried before packing and return",
      "Delicate or antique rugs are assessed individually at pickup",
    ],
  },
];

export function getService(slug: string): Service | undefined {
  return services.find((s) => s.slug === slug);
}

/** The 4-step booking journey (public "How it works"). Original copy. */
export const howItWorksSteps = [
  {
    title: "Schedule Pickup",
    description:
      "Book in a couple of minutes and pick a pickup slot that fits your day.",
  },
  {
    title: "We Collect",
    description:
      "Our pickup partner collects your laundry from your doorstep, tags it and weighs or counts it in front of you.",
  },
  {
    title: "Expert Cleaning",
    description:
      "Your items move through our staged care process — sorted, treated, cleaned and finished by garment type.",
  },
  {
    title: "Fresh Delivery",
    description:
      "Everything is packed, quality-checked and delivered back to your door, ready to use.",
  },
] as const;

/** The 6-stage garment-care process (public "Process"). Original copy. */
export const careStages = [
  {
    title: "Sorting & Inspection",
    description:
      "Each item is checked, pockets emptied, and loads sorted by fabric, colour and care label.",
  },
  {
    title: "Stain Treatment",
    description:
      "Visible marks get targeted pre-treatment before the main clean begins.",
  },
  {
    title: "Processing",
    description:
      "Garments are washed or dry cleaned with methods matched to what the fabric can take.",
  },
  {
    title: "Finishing",
    description:
      "Steam pressing, folding or hanging — the finish each garment actually needs.",
  },
  {
    title: "Quality Check",
    description:
      "Every piece is looked over once more. Anything that misses the mark goes back a step.",
  },
  {
    title: "Packing",
    description:
      "Clean items are packed folded, on hangers or protected, ready for the trip back to you.",
  },
] as const;
