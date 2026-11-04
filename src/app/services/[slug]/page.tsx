import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import CtaBand from "@/components/CtaBand";
import { getService, services } from "@/lib/services";

export function generateStaticParams() {
  return services.map((s) => ({ slug: s.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const service = getService(slug);
  if (!service) return { title: "Service not found" };
  return {
    title: service.name,
    description: service.shortDescription,
  };
}

export default async function ServiceDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const service = getService(slug);
  if (!service) notFound();

  return (
    <>
      <section className="mx-auto max-w-4xl px-4 py-14 sm:px-6">
        <Link href="/services" className="text-sm font-semibold text-brand-700 hover:text-brand-800">
          ← All services
        </Link>
        <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-ink-900 sm:text-4xl">
          {service.name}
        </h1>
        <p className="mt-5 text-base leading-relaxed text-ink-700">
          {service.longDescription}
        </p>

        <div className="mt-8 rounded-2xl bg-brand-50 p-6">
          <h2 className="font-bold text-ink-900">Good to know</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-ink-700">
            {service.goodToKnow.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>

        <p className="mt-8 text-sm leading-relaxed text-ink-500">
          This service is priced {service.unitLabel}. The final price is
          confirmed at pickup, once your items are counted or weighed — see
          the <Link href="/pricing" className="font-semibold text-brand-700">pricing page</Link> for
          how pricing works.
        </p>
      </section>
      <CtaBand />
    </>
  );
}
