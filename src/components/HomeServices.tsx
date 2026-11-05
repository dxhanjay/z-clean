import Link from "next/link";
import Reveal from "@/components/Reveal";
import ServiceCard from "@/components/ServiceCard";
import { services } from "@/lib/services";
import { loadStorefrontCatalogue } from "@/lib/catalogue-server";

/**
 * Homepage services section (Phase A) — the floating garment-card
 * grid. Prices come from the SAME storefront catalogue as the
 * pricing page and checkout (DB-first): each card shows the lowest
 * live rate for its service as "From ₹X". A service with no priced
 * items in the catalogue simply omits the price line rather than
 * inventing one.
 */
export default async function HomeServices() {
  const { groups } = await loadStorefrontCatalogue();
  const fromPriceBySlug = new Map<string, number>();
  for (const group of groups) {
    for (const item of group.items) {
      const current = fromPriceBySlug.get(item.serviceSlug);
      if (current === undefined || item.priceInr < current) {
        fromPriceBySlug.set(item.serviceSlug, item.priceInr);
      }
    }
  }

  return (
    <section aria-labelledby="services-heading" className="bg-white">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <Reveal>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-sm font-bold uppercase tracking-widest text-brand-600">
                Our services
              </p>
              <h2
                id="services-heading"
                className="mt-3 text-3xl font-extrabold tracking-tight text-ink-900 sm:text-4xl"
              >
                One place for every cleaning need
              </h2>
            </div>
            <Link
              href="/services"
              className="text-sm font-semibold text-brand-700 hover:text-brand-800"
            >
              View all services →
            </Link>
          </div>
        </Reveal>
        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {services.map((service, i) => (
            <Reveal key={service.slug} delay={(i % 4) * 90} className="h-full">
              <ServiceCard
                service={service}
                fromPriceInr={fromPriceBySlug.get(service.slug)}
              />
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
