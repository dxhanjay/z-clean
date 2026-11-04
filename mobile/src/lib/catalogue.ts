import { supabase } from "./supabase";
import type { CatalogueEntry } from "./totals";

/**
 * Storefront catalogue for the app (Mobile Phase 1).
 *
 * Mirrors the web storefront's data source honestly
 * (src/lib/catalogue-server.ts): in live mode the DATABASE is the
 * truth — services + price_items are read through the Supabase
 * client under the same public-read RLS policies the web uses, so
 * admin price edits appear here exactly as on the web. The bundled
 * groups below provide only presentation (group titles, unit notes,
 * item order, per-item unit labels) plus the approved fallback list
 * when the database is unreachable or empty — the same fallback the
 * web demo read uses. Prices are NEVER invented locally when the DB
 * answers.
 */

export interface PriceItemView {
  serviceSlug: string;
  itemName: string;
  priceInr: number;
  unitLabel: string;
  note?: string;
  expressMultiplier: number;
}

export interface PriceGroupView {
  title: string;
  serviceSlug: string;
  unitNote: string;
  items: PriceItemView[];
}

export interface StorefrontCatalogue {
  groups: PriceGroupView[];
  entries: CatalogueEntry[];
  fromDatabase: boolean;
}

/* Bundled presentation + fallback — mirrors web src/lib/pricing.ts
 * (the APPROVED price list). Prices here are used ONLY when the
 * database read fails or returns nothing. */
interface BundledItem {
  serviceSlug: string;
  itemName: string;
  priceInr: number;
  unitLabel: string;
  note?: string;
}

const bi = (
  serviceSlug: string,
  itemName: string,
  priceInr: number,
  unitLabel: string,
  note?: string,
): BundledItem => ({ serviceSlug, itemName, priceInr, unitLabel, note });

export const BUNDLED_GROUPS: { title: string; serviceSlug: string; unitNote: string; items: BundledItem[] }[] = [
  {
    title: "Laundry by weight",
    serviceSlug: "laundry-wash-and-fold",
    unitNote: "Charged per kg, weighed at pickup",
    items: [
      bi("laundry-wash-and-fold", "Wash & Fold", 70, "per kg"),
      bi("wash-and-iron", "Wash & Iron", 110, "per kg"),
    ],
  },
  {
    title: "Dry cleaning",
    serviceSlug: "dry-cleaning",
    unitNote: "Charged per piece",
    items: [
      bi("dry-cleaning", "Shirt / T-Shirt", 80, "per piece"),
      bi("dry-cleaning", "Trouser / Jeans", 90, "per piece"),
      bi("dry-cleaning", "Kurta", 90, "per piece"),
      bi("dry-cleaning", "Dress", 179, "per piece"),
      bi("dry-cleaning", "Blazer / Jacket", 199, "per piece"),
      bi("dry-cleaning", "Suit — 2 piece", 299, "per set"),
      bi("dry-cleaning", "Suit — 3 piece", 379, "per set"),
      bi("dry-cleaning", "Sherwani", 449, "per piece"),
      bi("dry-cleaning", "Coat", 249, "per piece"),
      bi("dry-cleaning", "Sweater / Sweatshirt", 149, "per piece"),
      bi("dry-cleaning", "Saree — plain / cotton", 199, "per piece"),
      bi("dry-cleaning", "Saree — heavy / silk / embroidered", 299, "per piece"),
      bi("dry-cleaning", "Lehenga — regular", 499, "per piece"),
      bi("dry-cleaning", "Lehenga — heavy / bridal", 899, "per piece", "Starting price — confirmed after inspection"),
    ],
  },
  {
    title: "Household",
    serviceSlug: "dry-cleaning",
    unitNote: "Blankets, bedding, curtains and carpets",
    items: [
      bi("dry-cleaning", "Blanket — single", 249, "per piece"),
      bi("dry-cleaning", "Blanket — double", 349, "per piece"),
      bi("dry-cleaning", "Quilt / Rajai — single", 349, "per piece"),
      bi("dry-cleaning", "Quilt / Rajai — double", 449, "per piece"),
      bi("dry-cleaning", "Bedsheet — single", 99, "per piece"),
      bi("dry-cleaning", "Bedsheet — double", 149, "per piece"),
      bi("curtain-cleaning", "Curtain", 129, "per panel"),
      bi("carpet-cleaning", "Carpet / Rug", 25, "per sq ft"),
    ],
  },
  {
    title: "Steam iron / press only",
    serviceSlug: "steam-iron-press",
    unitNote: "Press-only for pre-washed garments, per piece",
    items: [
      bi("steam-iron-press", "Shirt / T-Shirt / Trouser / Kurta", 15, "per piece"),
      bi("steam-iron-press", "Saree", 49, "per piece"),
      bi("steam-iron-press", "Suit — 2 piece (press)", 50, "per set"),
    ],
  },
  {
    title: "Shoe cleaning",
    serviceSlug: "shoe-cleaning",
    unitNote: "Charged per pair",
    items: [
      bi("shoe-cleaning", "Canvas shoes", 249, "per pair"),
      bi("shoe-cleaning", "Sneakers / Sports shoes", 299, "per pair"),
      bi("shoe-cleaning", "Leather shoes", 399, "per pair"),
      bi("shoe-cleaning", "Suede shoes", 449, "per pair"),
    ],
  },
  {
    title: "Leather care",
    serviceSlug: "leather-care",
    unitNote: "Final quote confirmed after inspection at pickup",
    items: [
      bi("leather-care", "Leather jacket (clean + condition)", 499, "per piece"),
      bi("leather-care", "Leather bag", 399, "per piece"),
      bi("leather-care", "Wallet / small leather accessory", 199, "per piece"),
    ],
  },
];

const BUNDLED_ITEMS: BundledItem[] = BUNDLED_GROUPS.flatMap((g) => g.items);

const UNIT_LABELS: Record<string, string> = {
  kg: "per kg",
  piece: "per piece",
  pair: "per pair",
  sqft: "per sq ft",
};

function bundledResult(): StorefrontCatalogue {
  return {
    groups: BUNDLED_GROUPS.map((g) => ({
      title: g.title,
      serviceSlug: g.serviceSlug,
      unitNote: g.unitNote,
      items: g.items.map((i) => ({ ...i, expressMultiplier: 1.5 })),
    })),
    entries: BUNDLED_ITEMS.map((i) => ({
      serviceSlug: i.serviceSlug,
      itemName: i.itemName,
      pricePaise: Math.round(i.priceInr * 100),
      unitLabel: i.unitLabel,
      expressMultiplier: 1.5,
    })),
    fromDatabase: false,
  };
}

interface DbService {
  id: string;
  slug: string;
  name: string;
  pricing_unit: string;
}

interface DbPriceItem {
  service_id: string;
  item_name: string;
  price_paise: number;
  express_multiplier: number;
}

/**
 * Load the catalogue the same way the web storefront does: DB first
 * (services + price_items, active only), bundled approved list as
 * the fallback. Grouping/presentation follows the web rule: items
 * join the bundled group of their service; DB-only services get
 * their own group.
 */
export async function loadCatalogue(): Promise<StorefrontCatalogue> {
  try {
    const [svcRes, itemRes] = await Promise.all([
      supabase.from("services").select("id, slug, name, pricing_unit").eq("active", true),
      supabase
        .from("price_items")
        .select("service_id, item_name, price_paise, express_multiplier")
        .eq("active", true),
    ]);
    if (svcRes.error || itemRes.error || !svcRes.data || !itemRes.data) {
      return bundledResult();
    }
    const services = svcRes.data as DbService[];
    const items = itemRes.data as DbPriceItem[];
    if (services.length === 0 || items.length === 0) return bundledResult();

    const serviceById = new Map(services.map((s) => [s.id, s]));
    const localByKey = new Map(BUNDLED_ITEMS.map((p) => [`${p.serviceSlug}::${p.itemName}`, p]));

    const entries: CatalogueEntry[] = [];
    const dbItemsByService = new Map<string, PriceItemView[]>();
    for (const row of items) {
      const svc = serviceById.get(row.service_id);
      if (!svc) continue;
      const local = localByKey.get(`${svc.slug}::${row.item_name}`);
      const unitLabel = local?.unitLabel ?? UNIT_LABELS[svc.pricing_unit] ?? "per piece";
      const expressMultiplier = Number(row.express_multiplier) || 1.5;
      entries.push({
        serviceSlug: svc.slug,
        itemName: row.item_name,
        pricePaise: row.price_paise,
        unitLabel,
        expressMultiplier,
      });
      const list = dbItemsByService.get(svc.slug) ?? [];
      list.push({
        serviceSlug: svc.slug,
        itemName: row.item_name,
        priceInr: row.price_paise / 100,
        unitLabel,
        note: local?.note,
        expressMultiplier,
      });
      dbItemsByService.set(svc.slug, list);
    }
    if (entries.length === 0) return bundledResult();

    const groups: PriceGroupView[] = [];
    const usedSlugs = new Set<string>();
    for (const g of BUNDLED_GROUPS) {
      const groupSlugs = new Set<string>([g.serviceSlug, ...g.items.map((i) => i.serviceSlug)]);
      const groupItems: PriceItemView[] = [];
      for (const slug of groupSlugs) {
        const dbItems = dbItemsByService.get(slug);
        if (!dbItems) continue;
        usedSlugs.add(slug);
        const staticOrder = new Map(
          BUNDLED_ITEMS.filter((p) => p.serviceSlug === slug).map((p, idx) => [p.itemName, idx]),
        );
        groupItems.push(
          ...[...dbItems].sort(
            (a, b) => (staticOrder.get(a.itemName) ?? 999) - (staticOrder.get(b.itemName) ?? 999),
          ),
        );
      }
      if (groupItems.length > 0) {
        groups.push({ title: g.title, serviceSlug: g.serviceSlug, unitNote: g.unitNote, items: groupItems });
      }
    }
    for (const svc of services) {
      if (usedSlugs.has(svc.slug)) continue;
      const dbItems = dbItemsByService.get(svc.slug);
      if (!dbItems || dbItems.length === 0) continue;
      const unitLabel = UNIT_LABELS[svc.pricing_unit] ?? "per piece";
      groups.push({
        title: svc.name,
        serviceSlug: svc.slug,
        unitNote: `Charged ${unitLabel}`,
        items: dbItems,
      });
    }

    return { groups, entries, fromDatabase: true };
  } catch {
    return bundledResult();
  }
}

/** Quantity step for an item — mirrors the web order form (0.5 for weighed/measured units, else 1). */
export function qtyStep(unitLabel: string): number {
  return unitLabel === "per kg" || unitLabel === "per sq ft" ? 0.5 : 1;
}
