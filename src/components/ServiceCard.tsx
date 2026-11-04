import Link from "next/link";
import type { Service } from "@/lib/services";
import { serviceImages } from "@/lib/media";

export default function ServiceCard({ service }: { service: Service }) {
  const image = serviceImages[service.slug];
  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-2xl border border-brand-100 bg-white shadow-sm transition-shadow hover:shadow-md">
      {image ? (
        <div className="overflow-hidden">
          <img
            src={image.src}
            alt={image.alt}
            loading="lazy"
            className="h-44 w-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
          />
        </div>
      ) : null}
      <div className="flex flex-1 flex-col p-6">
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
      </div>
    </article>
  );
}
