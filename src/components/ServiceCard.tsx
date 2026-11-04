import Link from "next/link";
import type { Service } from "@/lib/services";

export default function ServiceCard({ service }: { service: Service }) {
  return (
    <article className="flex h-full flex-col rounded-2xl border border-brand-100 bg-white p-6 shadow-sm transition-shadow hover:shadow-md">
      <h3 className="text-lg font-bold text-ink-900">{service.name}</h3>
      <p className="mt-2 flex-1 text-sm leading-relaxed text-ink-500">
        {service.shortDescription}
      </p>
      <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-brand-700">
        Priced {service.unitLabel}
      </p>
      <Link
        href={`/services/${service.slug}`}
        className="mt-3 text-sm font-semibold text-brand-700 hover:text-brand-800"
        aria-label={`Learn more about ${service.name}`}
      >
        Learn more →
      </Link>
    </article>
  );
}
