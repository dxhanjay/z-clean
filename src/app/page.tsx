import Link from "next/link";
import ServiceCard from "@/components/ServiceCard";
import CtaBand from "@/components/CtaBand";
import { careStages, howItWorksSteps, services } from "@/lib/services";
import { businessSettings } from "@/lib/config";

const trustPoints = [
  {
    title: "Your clothes stay yours",
    description:
      "Every customer's laundry is tagged and washed separately — loads are never mixed.",
  },
  {
    title: "Checked twice",
    description:
      "Items are inspected when they arrive and again before packing, so problems are caught early.",
  },
  {
    title: "Fabric-first cleaning",
    description:
      "Methods are chosen by fabric and care label, not one setting for everything.",
  },
  {
    title: "Trackable, end to end",
    description:
      "Your order status moves with your clothes, from pickup to delivery, in your account.",
  },
];

export default function HomePage() {
  return (
    <>
      {/* Hero */}
      <section className="bg-gradient-to-b from-brand-50 to-white">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
          <p className="text-sm font-bold uppercase tracking-widest text-brand-600">
            Laundry &amp; dry cleaning, door to door
          </p>
          <h1 className="mt-4 max-w-2xl text-4xl font-extrabold leading-tight tracking-tight text-ink-900 sm:text-5xl">
            Fresh clothes, zero laundry-day effort
          </h1>
          <p className="mt-5 max-w-xl text-base leading-relaxed text-ink-500 sm:text-lg">
            {businessSettings.name} picks up your laundry and dry cleaning,
            cares for every piece through a staged process, and delivers it
            back ready to wear. Book online, pay online or at your door, and
            track it all the way.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/schedule-pickup"
              className="rounded-full bg-brand-600 px-6 py-3 text-sm font-bold text-white shadow-sm transition-colors hover:bg-brand-700"
            >
              Schedule a Pickup
            </Link>
            <Link
              href="/process"
              className="rounded-full border border-brand-200 bg-white px-6 py-3 text-sm font-bold text-brand-800 transition-colors hover:bg-brand-50"
            >
              See How It Works
            </Link>
          </div>
        </div>
      </section>

      {/* Trust points */}
      <section aria-labelledby="why-heading" className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <h2 id="why-heading" className="text-2xl font-extrabold tracking-tight text-ink-900 sm:text-3xl">
          Why people hand their laundry to Z-clean
        </h2>
        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {trustPoints.map((point) => (
            <div key={point.title} className="rounded-2xl bg-brand-50 p-6">
              <h3 className="font-bold text-ink-900">{point.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-500">
                {point.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Services preview */}
      <section aria-labelledby="services-heading" className="bg-white">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <h2 id="services-heading" className="text-2xl font-extrabold tracking-tight text-ink-900 sm:text-3xl">
              One place for every cleaning need
            </h2>
            <Link href="/services" className="text-sm font-semibold text-brand-700 hover:text-brand-800">
              View all services →
            </Link>
          </div>
          <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {services.map((service) => (
              <ServiceCard key={service.slug} service={service} />
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section aria-labelledby="how-heading" className="bg-brand-50">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
          <h2 id="how-heading" className="text-2xl font-extrabold tracking-tight text-ink-900 sm:text-3xl">
            Done in four easy steps
          </h2>
          <ol className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {howItWorksSteps.map((step, i) => (
              <li key={step.title} className="rounded-2xl bg-white p-6 shadow-sm">
                <span className="text-3xl font-extrabold text-brand-300" aria-hidden="true">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h3 className="mt-3 font-bold text-ink-900">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-500">
                  {step.description}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Garment care process */}
      <section aria-labelledby="care-heading" className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <h2 id="care-heading" className="text-2xl font-extrabold tracking-tight text-ink-900 sm:text-3xl">
          A staged care process for every garment
        </h2>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-500 sm:text-base">
          Behind every order is the same careful sequence — six stages that
          keep fabrics, colours and finishes safe from drop-off to doorstep.
        </p>
        <ol className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {careStages.map((stage, i) => (
            <li key={stage.title} className="rounded-2xl border border-brand-100 p-6">
              <span className="text-sm font-bold text-brand-600">
                Stage {i + 1}
              </span>
              <h3 className="mt-1 font-bold text-ink-900">{stage.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-500">
                {stage.description}
              </p>
            </li>
          ))}
        </ol>
        <Link href="/process" className="mt-8 inline-block text-sm font-semibold text-brand-700 hover:text-brand-800">
          Read the full process →
        </Link>
      </section>

      <CtaBand />
    </>
  );
}
