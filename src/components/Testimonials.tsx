import Reveal from "@/components/Reveal";
import { loadApprovedReviews } from "@/lib/reviews-server";
import { starsFor } from "@/lib/reviews";

/**
 * Homepage Testimonials (Delta 3) — REAL reviews only.
 *
 * Renders the latest approved customer reviews from the reviews
 * table (written for DELIVERED orders, approved by staff — see
 * supabase/schema_v9.sql). While there are no approved reviews the
 * section returns null and the homepage simply has no testimonials
 * section: no placeholder quotes, no invented names, ever.
 */
export default async function Testimonials() {
  const reviews = await loadApprovedReviews();
  if (reviews.length === 0) return null;

  return (
    <section aria-labelledby="testimonials-heading" className="bg-white">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <Reveal>
          <p className="text-sm font-bold uppercase tracking-widest text-brand-600">
            Testimonials
          </p>
          <h2
            id="testimonials-heading"
            className="mt-3 text-3xl font-extrabold tracking-tight text-ink-900 sm:text-4xl"
          >
            What our customers say
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-500 sm:text-base">
            Real reviews from delivered orders, published after a quick
            check by our team.
          </p>
        </Reveal>
        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {reviews.slice(0, 6).map((review, i) => (
            <Reveal key={review.id} delay={(i % 3) * 90} className="h-full">
              <figure className="flex h-full flex-col rounded-[2rem] bg-white p-6 shadow-soft ring-1 ring-mist-200/70">
                <p
                  className="text-amber-500"
                  aria-label={`Rated ${review.rating} out of 5`}
                >
                  <span aria-hidden="true" className="text-base tracking-widest">
                    {starsFor(review.rating)}
                  </span>
                </p>
                <blockquote className="mt-3 flex-1 text-sm leading-relaxed text-ink-700">
                  “{review.text}”
                </blockquote>
                <figcaption className="mt-4 text-sm">
                  <span className="font-bold text-ink-900">{review.reviewerName}</span>
                  {review.area && (
                    <span className="text-ink-500"> · {review.area}</span>
                  )}
                </figcaption>
              </figure>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
