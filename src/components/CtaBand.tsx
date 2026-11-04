import Link from "next/link";

export default function CtaBand({
  title = "Ready to hand over laundry day?",
  text = "Create your account, book a pickup slot, and follow your order at every stage until it is back at your door.",
}: {
  title?: string;
  text?: string;
}) {
  return (
    <section className="bg-brand-700">
      <div className="mx-auto flex max-w-6xl flex-col items-start gap-6 px-4 py-14 sm:px-6 md:flex-row md:items-center md:justify-between">
        <div className="max-w-xl">
          <h2 className="text-2xl font-extrabold tracking-tight text-white sm:text-3xl">
            {title}
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-brand-100 sm:text-base">
            {text}
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/schedule-pickup"
            className="btn-press rounded-full bg-white px-6 py-3 text-sm font-bold text-brand-800 shadow-sm transition-colors hover:bg-brand-50"
          >
            Schedule a Pickup
          </Link>
          <Link
            href="/pricing"
            className="rounded-full border border-white/60 px-6 py-3 text-sm font-bold text-white transition-colors hover:bg-white/10"
          >
            See Pricing
          </Link>
        </div>
      </div>
    </section>
  );
}
