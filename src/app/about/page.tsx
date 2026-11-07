import type { Metadata } from "next";
import CtaBand from "@/components/CtaBand";
import { businessSettings } from "@/lib/config";

export const metadata: Metadata = {
  title: "About",
  description:
    "About Sri Clean: a laundry and dry-cleaning service built around careful, staged garment care and honest, trackable service.",
};

const values = [
  {
    title: "Care before speed",
    description:
      "A garment that comes back damaged was not cleaned fast — it was cleaned wrong. We sort, inspect and choose methods by fabric first, then work to the clock.",
  },
  {
    title: "Nothing mixed, nothing lost",
    description:
      "Your order is tagged at your door and stays together through every stage. One customer, one load, one record from pickup to delivery.",
  },
  {
    title: "Honest by default",
    description:
      "Prices are confirmed before cleaning starts. If something needs special treatment — or should not be cleaned at all — we tell you and wait for your go-ahead.",
  },
];

export default function AboutPage() {
  return (
    <>
      <section className="mx-auto max-w-4xl px-4 py-14 sm:px-6">
        <h1 className="text-3xl font-extrabold tracking-tight text-ink-900 sm:text-4xl">
          About {businessSettings.name}
        </h1>
        <p className="mt-5 text-base leading-relaxed text-ink-700">
          Sri Clean started with a simple frustration: laundry takes hours out
          of every week, yet handing your clothes to someone else often feels
          like a gamble. Will the white shirt come back white? Will the suit
          keep its shape? Will anything come back at all?
        </p>
        <p className="mt-4 text-base leading-relaxed text-ink-700">
          We built Sri Clean to remove the gamble. Every order is booked online,
          collected from your door, tagged so it can never mix with another
          customer&apos;s, and moved through a six-stage care process — sorting and
          inspection, stain treatment, processing, finishing, quality check
          and packing. You can watch the status change in your account while
          it happens, pay online or on delivery, and get everything back
          ready to wear.
        </p>
        <p className="mt-4 text-base leading-relaxed text-ink-700">
          {businessSettings.serviceAreasNote}
        </p>

        <h2 className="mt-12 text-2xl font-extrabold tracking-tight text-ink-900">
          What we stand for
        </h2>
        <div className="mt-6 grid gap-6 sm:grid-cols-3">
          {values.map((value) => (
            <div key={value.title} className="glass rounded-[1.5rem] p-6">
              <h3 className="font-bold text-ink-900">{value.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-500">
                {value.description}
              </p>
            </div>
          ))}
        </div>
      </section>
      <CtaBand />
    </>
  );
}
