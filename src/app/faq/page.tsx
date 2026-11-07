import type { Metadata } from "next";
import CtaBand from "@/components/CtaBand";
import { faqs } from "@/lib/faqs";

export const metadata: Metadata = {
  title: "FAQ",
  description:
    "Frequently asked questions about Sri Clean: booking a pickup, how pricing is confirmed, payment options, tracking and garment care.",
};

export default function FaqPage() {
  return (
    <>
      <section className="mx-auto max-w-4xl px-4 py-14 sm:px-6">
        <h1 className="text-3xl font-extrabold tracking-tight text-ink-900 sm:text-4xl">
          Frequently asked questions
        </h1>
        <div className="glass mt-10 divide-y divide-brand-100 rounded-[2rem] px-6 sm:px-8">
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
