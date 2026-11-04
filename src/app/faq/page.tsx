import type { Metadata } from "next";
import CtaBand from "@/components/CtaBand";

export const metadata: Metadata = {
  title: "FAQ",
  description:
    "Frequently asked questions about Z-clean: booking a pickup, how pricing is confirmed, payment options, tracking and garment care.",
};

/** Original answers only — no claims about areas, prices or timelines that
 *  have not been confirmed by the business owner yet. */
const faqs = [
  {
    q: "How do I book a pickup?",
    a: "Create an account, choose your services and pick a pickup slot that suits you. Our pickup partner comes to your address, tags your items and counts or weighs them in front of you.",
  },
  {
    q: "How is the price of my order decided?",
    a: "Each service is priced by a unit — per kg for wash & fold, per piece for dry cleaning and ironing, per pair for shoes, per sq ft for carpets. The exact total is confirmed with you at pickup, once items are counted or weighed, and nothing is cleaned until you approve it.",
  },
  {
    q: "How can I pay?",
    a: "You can pay online when you book, or pay on delivery when your order comes back. Online payments are confirmed by our payment provider before your order is marked paid.",
  },
  {
    q: "Can I track my order?",
    a: "Yes. Your account shows your order's status as it moves — pickup scheduled, picked up, in process, ready, out for delivery and delivered — so you always know where your laundry is.",
  },
  {
    q: "Will my laundry be mixed with other customers' clothes?",
    a: "No. Your items are tagged at pickup and washed as your own separate load. Sorting by colour and fabric happens within your order, never across customers.",
  },
  {
    q: "What happens if an item needs special care?",
    a: "During inspection, anything delicate, embellished or stained gets flagged. If it needs treatment beyond the service you booked, we contact you and only proceed with your approval.",
  },
  {
    q: "Do you offer express service?",
    a: "Express turnaround will be available for selected services in our launch areas. Where it is offered, the express price and delivery time are shown and confirmed before you book — never added afterwards.",
  },
  {
    q: "Which areas do you serve?",
    a: "Our launch service areas are being confirmed and will be listed on this page and during booking as soon as they are live. If your area is not covered yet, creating an account keeps you first in line when we open there.",
  },
  {
    q: "What if something comes back not quite right?",
    a: "Tell us through your account or the contact page. Items that miss our quality check standard are re-processed — that is exactly what the final quality-check stage is for.",
  },
];

export default function FaqPage() {
  return (
    <>
      <section className="mx-auto max-w-4xl px-4 py-14 sm:px-6">
        <h1 className="text-3xl font-extrabold tracking-tight text-ink-900 sm:text-4xl">
          Frequently asked questions
        </h1>
        <div className="mt-10 divide-y divide-brand-100">
          {faqs.map((faq) => (
            <details key={faq.q} className="group py-5">
              <summary className="cursor-pointer list-none font-bold text-ink-900 marker:hidden">
                <span className="flex items-center justify-between gap-4">
                  {faq.q}
                  <span aria-hidden="true" className="text-brand-600 transition-transform group-open:rotate-45">
                    +
                  </span>
                </span>
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-ink-500 sm:text-base">
                {faq.a}
              </p>
            </details>
          ))}
        </div>
      </section>
      <CtaBand
        title="Still have a question?"
        text="Reach us through the contact page and we will get back to you. For order-specific questions, asking from your account keeps everything in one place."
      />
    </>
  );
}
