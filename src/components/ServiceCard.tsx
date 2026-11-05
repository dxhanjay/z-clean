import Link from "next/link";
import type { Service } from "@/lib/services";
import { serviceImages } from "@/lib/media";
import { formatInr } from "@/lib/pricing";
import Tilt from "@/components/motion/Tilt";

/**
 * Service card (Phase A redesign) — floating garment card in the new
 * language: oversized radius, soft shadow, a small coloured corner
 * tab, and a hover lift. Phase 5 wraps it in the Tilt shell:
 * a fine pointer tips the card in CSS 3D with a sheen sweep
 * (rules in src/lib/motion.ts; touch and reduced-motion visitors
 * get the Phase A card exactly as before). `fromPriceInr` is optional: the homepage
 * passes the live catalogue's lowest rate for the service ("From
 * ₹X"); surfaces that don't load the catalogue (the services index)
 * omit it and show the priced-by unit exactly as before.
 */

const TAB_COLORS = [
  "bg-brand-500",
  "bg-sky-500",
  "bg-amber-500",
  "bg-rose-400",
  "bg-violet-400",
  "bg-teal-500",
];

function tabColor(slug: string): string {
  let hash = 0;
  for (let i = 0; i < slug.length; i += 1) {
    hash = (hash * 31 + slug.charCodeAt(i)) % 997;
  }
  return TAB_COLORS[hash % TAB_COLORS.length];
}

function CornerTab({ slug }: { slug: string }) {
  return (
    <span
      aria-hidden="true"
      className={`absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-xl text-white shadow-soft ${tabColor(slug)}`}
    >
      <svg
        viewBox="0 0 24 24"
        className="h-4.5 w-4.5"
        width="18"
        height="18"
        fill="currentColor"
      >
        <path d="M12 2.7c3.2 3.9 6.3 7.9 6.3 11.4a6.3 6.3 0 1 1-12.6 0C5.7 10.6 8.8 6.6 12 2.7Z" />
      </svg>
    </span>
  );
}

export default function ServiceCard({
  service,
  fromPriceInr,
}: {
  service: Service;
  fromPriceInr?: number;
}) {
  const image = serviceImages[service.slug];
  return (
    <Tilt className="relative h-full rounded-[2rem]">
    <article className="group relative flex h-full flex-col overflow-hidden rounded-[2rem] bg-white shadow-soft ring-1 ring-mist-200/70 transition-all duration-300 hover:-translate-y-1 hover:shadow-soft-lg">
      {image ? (
        <div className="relative overflow-hidden">
          <img
            src={image.src}
            alt={image.alt}
            loading="lazy"
            className="h-44 w-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
          />
          <CornerTab slug={service.slug} />
        </div>
      ) : (
        <div className="relative flex h-28 items-end overflow-hidden bg-pastel-hero px-6 pb-4">
          <span
            aria-hidden="true"
            className="text-5xl font-extrabold leading-none text-navy-900/10"
          >
            {service.name.charAt(0)}
          </span>
          <CornerTab slug={service.slug} />
        </div>
      )}
      <div className="flex flex-1 flex-col p-6">
        <h3 className="text-lg font-bold text-ink-900">{service.name}</h3>
        <p className="mt-2 flex-1 text-sm leading-relaxed text-ink-500">
          {service.shortDescription}
        </p>
        <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-brand-700">
          {fromPriceInr !== undefined
            ? `From ${formatInr(fromPriceInr)} ${service.unitLabel}`
            : `Priced ${service.unitLabel}`}
        </p>
        <Link
          href={`/services/${service.slug}`}
          className="mt-3 text-sm font-semibold text-brand-700 hover:text-brand-800"
          aria-label={`Learn more about ${service.name}`}
        >
          Learn more →
        </Link>
      </div>
    </article>
    </Tilt>
  );
}
