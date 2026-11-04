import type { Metadata } from "next";
import CtaBand from "@/components/CtaBand";
import { careStages, howItWorksSteps } from "@/lib/services";

export const metadata: Metadata = {
  title: "How It Works",
  description:
    "How Z-clean works: schedule a pickup, we collect from your door, your clothes go through a six-stage care process, and everything is delivered back fresh.",
};

export default function ProcessPage() {
  return (
    <>
      <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <h1 className="text-3xl font-extrabold tracking-tight text-ink-900 sm:text-4xl">
          How Z-clean works
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-ink-500">
          Four steps for you, six stages of care for your clothes. Here is the
          whole journey, from the moment you book to the knock at your door.
        </p>

        <h2 className="mt-12 text-2xl font-extrabold tracking-tight text-ink-900">
          Your four steps
        </h2>
        <ol className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {howItWorksSteps.map((step, i) => (
            <li key={step.title} className="rounded-2xl border border-brand-100 p-6">
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

        <h2 className="mt-14 text-2xl font-extrabold tracking-tight text-ink-900">
          Our six stages of garment care
        </h2>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-500 sm:text-base">
          Once your order reaches us, it moves through the same sequence every
          time — no shortcuts, whatever the service.
        </p>
        <ol className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {careStages.map((stage, i) => (
            <li key={stage.title} className="rounded-2xl bg-brand-50 p-6">
              <span className="text-sm font-bold text-brand-600">Stage {i + 1}</span>
              <h3 className="mt-1 font-bold text-ink-900">{stage.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-500">
                {stage.description}
              </p>
            </li>
          ))}
        </ol>

        <div className="mt-12 rounded-2xl border border-brand-100 p-6">
          <h2 className="font-bold text-ink-900">Follow it live</h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-500">
            Every stage change updates your order status, so your account
            always shows where your laundry is — picked up, in process, ready,
            or out for delivery.
          </p>
        </div>
      </section>
      <CtaBand />
    </>
  );
}
