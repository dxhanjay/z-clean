import Link from "next/link";
import ScrollReveal3D from "@/components/motion/ScrollReveal3D";
import { loadStorefrontCatalogue } from "@/lib/catalogue-server";
import { formatInr, pricingTerms } from "@/lib/pricing";

/**
 * Homepage pricing teaser (Delta 3, fidelity pass) — a short "from"
 * price table read from the SAME catalogue the pricing page and
 * checkout use (DB-first via loadStorefrontCatalogue), so an admin
 * price edit moves this teaser too. If an expected highlight item is
 * ever removed from the catalogue it simply drops out of the table;
 * an empty table hides the whole section.
 */

const HIGHLIGHTS: { serviceSlug: string; itemName: string }[] = [
  { serviceSlug: "laundry-wash-and-fold", itemName: "Wash & Fold" },
  { serviceSlug: "wash-and-iron", itemName: "Wash & Iron" },
  { serviceSlug: "dry-cleaning", itemName: "Shirt / T-Shirt" },
  { serviceSlug: "dry-cleaning", itemName: "Saree — heavy / silk / embroidered" },
  { serviceSlug: "dry-cleaning", itemName: "Suit — 2 piece" },
  { serviceSlug: "steam-iron-press", itemName: "Shirt / T-Shirt / Trouser / Kurta" },
];

const SERVICE_LABELS: Record<string, string> = {
  "laundry-wash-and-fold": "Wash & Fold",
  "wash-and-iron": "Wash & Iron",
  "dry-cleaning": "Dry Cleaning",
  "steam-iron-press": "Steam Iron / Press",
};

export default async function PricingTeaser() {
  const { groups } = await loadStorefrontCatalogue();
  const byKey = new Map<string, { priceInr: number; unitLabel: string }>();
  for (const group of groups) {
    for (const item of group.items) {
      byKey.set(`${item.serviceSlug}::${item.itemName}`, {
        priceInr: item.priceInr,
        unitLabel: item.unitLabel,
      });
    }
  }
  const rows = HIGHLIGHTS.flatMap((h) => {
    const found = byKey.get(`${h.serviceSlug}::${h.itemName}`);
    if (!found) return [];
    return [
      {
        service: SERVICE_LABELS[h.serviceSlug] ?? h.serviceSlug,
        item: h.itemName,
        price: formatInr(found.priceInr),
        unit: found.unitLabel,
      },
    ];
  });
  if (rows.length === 0) return null;

  return (
    <section aria-labelledby="pricing-heading" className="bg-mist-100/70">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
      <div className="grid items-start gap-10 lg:grid-cols-5">
        <ScrollReveal3D className="lg:col-span-2">
          <p className="text-sm font-bold uppercase tracking-widest text-brand-600">
            Pricing
          </p>
          <h2
            id="pricing-heading"
            className="mt-3 text-3xl font-extrabold tracking-tight text-ink-900 sm:text-4xl"
          >
            Honest rates, confirmed before we clean
          </h2>
          <p className="mt-4 text-base leading-relaxed text-ink-500">
            Every service is priced by a clear unit, and the final total
            of your order is confirmed with you at pickup — once items
            are counted or weighed — before any cleaning begins.
          </p>
          <ul className="mt-5 space-y-2 text-sm leading-relaxed text-ink-700">
            <li>
              · Free pickup &amp; delivery on orders of{" "}
              {formatInr(pricingTerms.freeDeliveryThresholdInr)} or more (
              {formatInr(pricingTerms.deliveryFeeBelowThresholdInr)} below
              that)
            </li>
            <li>· Minimum order {formatInr(pricingTerms.minimumOrderInr)}</li>
            <li>
              · Express turnaround at {pricingTerms.expressMultiplier}× where
              offered — always shown before you book
            </li>
          </ul>
          <Link
            href="/pricing"
            className="mt-6 inline-block text-sm font-semibold text-brand-700 hover:text-brand-800"
          >
            See the full price list →
          </Link>
        </ScrollReveal3D>
        <ScrollReveal3D index={1} className="lg:col-span-3">
          <div className="glass overflow-hidden rounded-[2rem]">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">
                Popular Z-clean services and their rates
              </caption>
              <thead>
                <tr className="bg-mist-100 text-xs uppercase tracking-wide text-ink-500">
                  <th scope="col" className="px-5 py-3 font-bold">Service</th>
                  <th scope="col" className="px-5 py-3 font-bold">Item</th>
                  <th scope="col" className="px-5 py-3 text-right font-bold">Rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-mist-100">
                {rows.map((row) => (
                  <tr key={`${row.service}-${row.item}`}>
                    <td className="px-5 py-3.5 font-semibold text-ink-900">{row.service}</td>
                    <td className="px-5 py-3.5 text-ink-500">{row.item}</td>
                    <td className="px-5 py-3.5 text-right font-bold text-ink-900">
                      {row.price}
                      <span className="ml-1 text-xs font-semibold text-ink-500">
                        {row.unit}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ScrollReveal3D>
      </div>
      </div>
    </section>
  );
}
