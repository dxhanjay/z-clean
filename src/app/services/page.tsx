import type { Metadata } from "next";
import ServiceCard from "@/components/ServiceCard";
import CtaBand from "@/components/CtaBand";
import { services } from "@/lib/services";

export const metadata: Metadata = {
  title: "Services",
  description:
    "Explore Z-clean services: laundry wash & fold, wash & iron, dry cleaning, steam press, shoe cleaning, leather care, curtain and carpet cleaning.",
};

export default function ServicesPage() {
  return (
    <>
      <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <h1 className="text-3xl font-extrabold tracking-tight text-ink-900 sm:text-4xl">
          Our services
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-ink-500">
          From the weekly laundry pile to the suit you save for occasions —
          every service below follows the same staged care process, with
          pickup and delivery from your door.
        </p>
        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {services.map((service) => (
            <ServiceCard key={service.slug} service={service} />
          ))}
        </div>
      </section>
      <CtaBand
        title="Not sure which service fits?"
        text="Book a pickup and note the item at checkout — we inspect everything on arrival and confirm the right treatment with you before cleaning begins."
      />
    </>
  );
}
