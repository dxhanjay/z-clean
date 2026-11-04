import type { Metadata } from "next";
import Link from "next/link";
import CtaBand from "@/components/CtaBand";
import {
  DEMO_CITY,
  formatInr,
  priceGroups,
  pricingTerms,
} from "@/lib/pricing";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Z-clean's approved Bokaro Steel City price list: per-kg laundry, per-piece dry cleaning, shoe and leather care — final total confirmed at pickup.",
};

export default function PricingPage() {
  return (
    <>
      <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <h1 className="text-3xl font-extrabold tracking-tight text-ink-900 sm:text-4xl">
          Simple, transparent pricing
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-ink-500">
          Every service is priced by a clear unit — by weight, by piece, by
          pair or by area — so you always know what you are paying for before
          any cleaning begins.
        </p>

        <div
          role="status"
          className="mt-8 rounded-2xl border border-brand-200 bg-brand-50 p-6"
        >
          <h2 className="font-bold text-ink-900">
            Our {DEMO_CITY} price list — approved rates
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-700">
            These are Z-clean&apos;s confirmed rates for {DEMO_CITY}. The
            final total of every order is confirmed with you at pickup, after
            your items are counted or weighed — and nothing is cleaned until
            you have approved it.
          </p>
        </div>

        <div className="mt-10 grid gap-10 lg:grid-cols-2">
          {priceGroups.map((group) => (
            <div key={group.title}>
              <h2 className="text-xl font-extrabold tracking-tight text-ink-900">
                {group.title}
              </h2>
              <p className="mt-1 text-sm text-ink-500">{group.unitNote}</p>
              <table className="mt-4 w-full border-collapse text-left text-sm">
                <caption className="sr-only">{group.title} prices</caption>
                <tbody>
                  {group.items.map((row) => (
                    <tr key={`${row.serviceSlug}-${row.itemName}`} className="border-b border-brand-50">
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
          <div className="rounded-2xl bg-brand-50 p-6">
            <h2 className="font-bold text-ink-900">Minimum order &amp; delivery</h2>
            <p className="mt-2 text-sm leading-relaxed text-ink-500">
              Minimum order {formatInr(pricingTerms.minimumOrderInr)} per
              pickup. Pickup &amp; delivery are free on orders of{" "}
              {formatInr(pricingTerms.freeDeliveryThresholdInr)} or more; a{" "}
              {formatInr(pricingTerms.deliveryFeeBelowThresholdInr)} delivery
              fee applies below that.
            </p>
          </div>
          <div className="rounded-2xl bg-brand-50 p-6">
            <h2 className="font-bold text-ink-900">Express delivery</h2>
            <p className="mt-2 text-sm leading-relaxed text-ink-500">
              In a hurry? Express same-day / next-day delivery is available on
              selected services at {pricingTerms.expressMultiplier}× the
              regular price, confirmed before you commit.
            </p>
          </div>
          <div className="rounded-2xl bg-brand-50 p-6">
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
            className="inline-block rounded-full bg-brand-600 px-6 py-3 text-sm font-bold text-white hover:bg-brand-700"
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
