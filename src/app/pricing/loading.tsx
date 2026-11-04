import { Skeleton, SkeletonText } from "@/components/Skeleton";

/**
 * Pricing route skeleton (smoothness pass) — mirrors PricingPage's
 * layout: title, intro, approved-rates panel, two price-table columns
 * and the three info cards, so the page settles without shifting.
 */
export default function PricingLoading() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6" aria-label="Loading pricing">
      <Skeleton className="h-10 w-72 max-w-full" />
      <SkeletonText lines={2} className="mt-4 max-w-2xl" />

      <div className="mt-8 rounded-2xl border border-brand-100 p-6">
        <Skeleton className="h-5 w-64 max-w-full" />
        <SkeletonText lines={2} className="mt-3 max-w-2xl" />
      </div>

      <div className="mt-10 grid gap-10 lg:grid-cols-2">
        {[0, 1].map((col) => (
          <div key={col}>
            <Skeleton className="h-6 w-48" />
            <Skeleton className="mt-2 h-3.5 w-32" />
            <div className="mt-4 grid gap-1">
              {[0, 1, 2, 3, 4, 5].map((row) => (
                <div key={row} className="flex items-center justify-between gap-4 border-b border-brand-50 py-2.5">
                  <Skeleton className="h-4 w-40 max-w-[60%]" />
                  <Skeleton className="h-4 w-16" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-12 grid gap-6 sm:grid-cols-3">
        {[0, 1, 2].map((card) => (
          <div key={card} className="rounded-2xl bg-brand-50 p-6">
            <Skeleton className="h-5 w-36 max-w-full" />
            <SkeletonText lines={3} className="mt-3" />
          </div>
        ))}
      </div>
    </section>
  );
}
