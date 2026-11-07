import type { Metadata } from "next";
import Link from "next/link";
import CtaBand from "@/components/CtaBand";
import ScrollReveal3D from "@/components/motion/ScrollReveal3D";
import {
  DEMO_CITY,
  formatInr,
  pricingTerms,
} from "@/lib/pricing";
import { loadStorefrontCatalogue } from "@/lib/catalogue-server";

// Prices must reflect admin edits immediately — never bake them at
// build time.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Sri Clean's approved Bokaro Steel City price list: per-kg laundry, per-piece dry cleaning, shoe and leather care — final total confirmed at pickup.",
};

/**
 * Prices are read DB-first (Phase 7b): in live mode the services /
 * price_items tables are the truth — the same rows checkout re-prices
 * from — so an admin edit at /admin/pricing shows here immediately.
 * The approved static list is the fallback when Supabase is not
 * configured or the read fails.
 */
export default async function PricingPage() {
  const { groups: priceGroups } = await loadStorefrontCatalogue();
  return (
    <>
      <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <ScrollReveal3D>
          <div className="glass rounded-[2.5rem] px-6 py-10 sm:px-10">
            <h1 className="text-3xl font-extrabold tracking-tight text-ink-900 sm:text-4xl">
              Simple, transparent pricing
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-relaxed text-ink-500">
              Every service is priced by a clear unit — by weight, by piece, by
              pair or by area — so you always know what you are paying for before
              any cleaning begins.
            </p>
          </div>
        </ScrollReveal3D>

        <div
          role="status"
          className="glass mt-8 rounded-[2rem] p-6"
        >
          <h2 className="font-bold text-ink-900">
            Our {DEMO_CITY} price list — approved rates
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-700">
            These are Sri Clean&apos;s confirmed rates for {DEMO_CITY}. The
            final total of every order is confirmed with you at pickup, after
            your items are counted or weighed — and nothing is cleaned until
            you have approved it.
          </p>
        </div>

        <div className="mt-10 grid gap-10 lg:grid-cols-2">
          {priceGroups.map((group) => (
            <div key={group.title} className="glass rounded-[2rem] p-6 sm:p-8">
              <h2 className="text-xl font-extrabold tracking-tight text-ink-900">
                {group.title}
              </h2>
              <p className="mt-1 text-sm text-ink-500">{group.unitNote}</p>
              <table className="mt-4 w-full border-collapse text-left text-sm">
                <caption className="sr-only">{group.title} prices</caption>
                <tbody>
                  {group.items.map((row) => (
                    <tr key={`${row.serviceSlug}-${row.itemName}`} className="border-b border-mist-100">
                      <td className="py-2.5 pr-4 text-ink-700">
                        <Link
                          href={`/services/${row.serviceSlug}`}
                          className="font-semibold text-ink-900 hover:text-brand-700"
                        >
                          {row.itemName}
                        </Link>
                        {row.note && (
                          <span className="block text-xs text-ink-500">{row.note}</span>
                        )}
                      </td>
                      <td className="py-2.5 text-right font-bold text-ink-900">
                        {formatInr(row.priceInr)}
                        <span className="ml-1 text-xs font-normal text-ink-500">
                          {row.unitLabel}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>

        <div className="mt-12 grid gap-6 sm:grid-cols-3">
          <div className="rounded-[2rem] bg-white p-6 shadow-soft ring-1 ring-mist-200/70">
            <h2 className="font-bold text-ink-900">Minimum order &amp; delivery</h2>
            <p className="mt-2 text-sm leading-relaxed text-ink-500">
              Minimum order {formatInr(pricingTerms.minimumOrderInr)} per
              pickup. Pickup &amp; delivery are free on orders of{" "}
              {formatInr(pricingTerms.freeDeliveryThresholdInr)} or more; a{" "}
              {formatInr(pricingTerms.deliveryFeeBelowThresholdInr)} delivery
              fee applies below that.
            </p>
          </div>
          <div className="rounded-[2rem] bg-white p-6 shadow-soft ring-1 ring-mist-200/70">
            <h2 className="font-bold text-ink-900">Express delivery</h2>
            <p className="mt-2 text-sm leading-relaxed text-ink-500">
              In a hurry? Express same-day / next-day delivery is available on
              selected services at {pricingTerms.expressMultiplier}× the
              regular price, confirmed before you commit.
            </p>
          </div>
          <div className="rounded-[2rem] bg-white p-6 shadow-soft ring-1 ring-mist-200/70">
            <h2 className="font-bold text-ink-900">
              First order? Use {pricingTerms.firstOrderCoupon.code}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-ink-500">
              Get {pricingTerms.firstOrderCoupon.pctOff}% off your first
              order with code {pricingTerms.firstOrderCoupon.code} — applied
              at checkout when you place your order.
            </p>
          </div>
        </div>

        <div className="mt-10 flex flex-wrap gap-3">
          <Link
            href="/order"
            className="btn-press inline-block rounded-full bg-brand-600 px-6 py-3 text-sm font-bold text-white hover:bg-brand-700"
          >
            Place an order
          </Link>
          <Link
            href="/schedule-pickup"
            className="inline-block rounded-full border border-brand-200 px-6 py-3 text-sm font-semibold text-ink-700 hover:bg-brand-50"
          >
            Schedule a pickup
          </Link>
        </div>
      </section>
      <CtaBand />
    </>
  );
}
