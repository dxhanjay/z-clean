import Link from "next/link";
import Reveal from "@/components/Reveal";
import { faqs } from "@/lib/faqs";

/**
 * Homepage FAQ teaser (Delta 3, fidelity pass) — the first few
 * questions from the SAME lib the /faq page renders (src/lib/faqs.ts),
 * in the same details/summary treatment, with a link to the rest.
 */
export default function FaqTeaser({ count = 4 }: { count?: number }) {
  const shown = faqs.slice(0, count);
  if (shown.length === 0) return null;

  return (
    <section aria-labelledby="faq-heading" className="mx-auto max-w-4xl px-4 py-16 sm:px-6 sm:py-20">
      <Reveal>
        <p className="text-center text-sm font-bold uppercase tracking-widest text-brand-600">
          FAQ
        </p>
        <h2
          id="faq-heading"
          className="mt-3 text-center text-3xl font-extrabold tracking-tight text-ink-900 sm:text-4xl"
        >
          Questions, answered
        </h2>
      </Reveal>
      <Reveal>
        <div className="mt-8 divide-y divide-brand-100">
          {shown.map((faq) => (
            <details key={faq.q} className="group py-5">
              <summary className="cursor-pointer list-none font-bold text-ink-900 marker:hidden">
                <span className="flex items-center justify-between gap-4">
                  {faq.q}
                  <span
                    aria-hidden="true"
                    className="text-brand-600 transition-transform group-open:rotate-45"
                  >
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
      </Reveal>
      <p className="mt-4 text-center">
        <Link
          href="/faq"
          className="text-sm font-semibold text-brand-700 hover:text-brand-800"
        >
          See all questions →
        </Link>
      </p>
    </section>
  );
}
