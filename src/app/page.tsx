import Link from "next/link";
import ServiceCard from "@/components/ServiceCard";
import CtaBand from "@/components/CtaBand";
import HeroSlider from "@/components/HeroSlider";
import Marquee from "@/components/Marquee";
import Reveal from "@/components/Reveal";
import { careStages, howItWorksSteps, services } from "@/lib/services";
import { aboutImages, stepImages, whyImage } from "@/lib/media";
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
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-16 sm:px-6 sm:py-24 lg:grid-cols-2">
          <div>
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
          <HeroSlider />
        </div>
      </section>

      {/* Services marquee */}
      <Marquee />

      {/* About band */}
      <section aria-labelledby="about-heading" className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <div className="grid items-center gap-10 lg:grid-cols-2">
          <Reveal>
            <div className="grid grid-cols-2 gap-4">
              <img
                src={aboutImages[0].src}
                alt={aboutImages[0].alt}
                loading="lazy"
                className="h-full min-h-64 w-full rounded-2xl object-cover"
              />
              <div className="grid gap-4">
                <img
                  src={aboutImages[1].src}
                  alt={aboutImages[1].alt}
                  loading="lazy"
                  className="h-full min-h-32 w-full rounded-2xl object-cover"
                />
                <img
                  src={aboutImages[2].src}
                  alt={aboutImages[2].alt}
                  loading="lazy"
                  className="h-full min-h-32 w-full rounded-2xl object-cover"
                />
              </div>
            </div>
          </Reveal>
          <Reveal delay={120}>
            <h2 id="about-heading" className="text-2xl font-extrabold tracking-tight text-ink-900 sm:text-3xl">
              About {businessSettings.name}
            </h2>
            <p className="mt-4 text-base leading-relaxed text-ink-700">
              Z-clean started with a simple frustration: laundry takes hours
              out of every week, yet handing your clothes to someone else
              often feels like a gamble. Will the white shirt come back
              white? Will the suit keep its shape? Will anything come back
              at all?
            </p>
            <p className="mt-4 text-base leading-relaxed text-ink-700">
              We built Z-clean to remove the gamble. Every order is booked
              online, collected from your door, tagged so it can never mix
              with another customer&apos;s, and moved through a six-stage
              care process — sorting and inspection, stain treatment,
              processing, finishing, quality check and packing. You can
              watch the status change in your account while it happens, pay
              online or on delivery, and get everything back ready to wear.
            </p>
            <Link
              href="/about"
              className="mt-6 inline-block text-sm font-semibold text-brand-700 hover:text-brand-800"
            >
              More about us →
            </Link>
          </Reveal>
        </div>
      </section>

      {/* Trust points */}
      <section aria-labelledby="why-heading" className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <Reveal>
          <h2 id="why-heading" className="text-2xl font-extrabold tracking-tight text-ink-900 sm:text-3xl">
            Why people hand their laundry to Z-clean
          </h2>
        </Reveal>
        <div className="mt-8 grid items-stretch gap-6 lg:grid-cols-5">
          <Reveal className="group overflow-hidden rounded-2xl lg:col-span-2">
            <img
              src={whyImage.src}
              alt={whyImage.alt}
              loading="lazy"
              className="h-64 w-full object-cover transition-transform duration-500 ease-out group-hover:scale-105 lg:h-full"
            />
          </Reveal>
          <div className="grid gap-6 sm:grid-cols-2 lg:col-span-3">
            {trustPoints.map((point, i) => (
              <Reveal key={point.title} delay={i * 90}>
                <div className="h-full rounded-2xl bg-brand-50 p-6">
                  <h3 className="font-bold text-ink-900">{point.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-ink-500">
                    {point.description}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Services preview */}
      <section aria-labelledby="services-heading" className="bg-white">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
          <Reveal>
            <div className="flex flex-wrap items-end justify-between gap-4">
              <h2 id="services-heading" className="text-2xl font-extrabold tracking-tight text-ink-900 sm:text-3xl">
                One place for every cleaning need
              </h2>
              <Link href="/services" className="text-sm font-semibold text-brand-700 hover:text-brand-800">
                View all services →
              </Link>
            </div>
          </Reveal>
          <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {services.map((service, i) => (
              <Reveal key={service.slug} delay={(i % 4) * 90} className="h-full">
                <ServiceCard service={service} />
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section aria-labelledby="how-heading" className="bg-brand-50">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
          <Reveal>
            <h2 id="how-heading" className="text-2xl font-extrabold tracking-tight text-ink-900 sm:text-3xl">
              Done in four easy steps
            </h2>
          </Reveal>
          <Reveal className="relative">
            <div
              aria-hidden="true"
              className="steps-line absolute left-0 right-0 top-24 hidden h-0.5 bg-brand-200 lg:block"
            />
            <ol className="relative mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {howItWorksSteps.map((step, i) => (
                <li key={step.title} className="group overflow-hidden rounded-2xl bg-white shadow-sm">
                  <div className="overflow-hidden">
                    <img
                      src={stepImages[i].src}
                      alt={stepImages[i].alt}
                      loading="lazy"
                      className="h-36 w-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
                    />
                  </div>
                  <div className="p-6">
                    <span className="text-3xl font-extrabold text-brand-300" aria-hidden="true">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <h3 className="mt-3 font-bold text-ink-900">{step.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-ink-500">
                      {step.description}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </Reveal>
        </div>
      </section>

      {/* Garment care process */}
      <section aria-labelledby="care-heading" className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <Reveal>
          <h2 id="care-heading" className="text-2xl font-extrabold tracking-tight text-ink-900 sm:text-3xl">
            A staged care process for every garment
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-500 sm:text-base">
            Behind every order is the same careful sequence — six stages that
            keep fabrics, colours and finishes safe from drop-off to doorstep.
          </p>
        </Reveal>
        <Reveal>
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
        </Reveal>
        <Link href="/process" className="mt-8 inline-block text-sm font-semibold text-brand-700 hover:text-brand-800">
          Read the full process →
        </Link>
      </section>

      <CtaBand />
    </>
  );
}
