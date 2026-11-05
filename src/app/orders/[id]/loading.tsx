import { Skeleton, SkeletonText } from "@/components/Skeleton";

/**
 * Order detail route skeleton (smoothness pass) — mirrors the loaded
 * OrderDetailPage layout: back link, title row with two badge pills,
 * the timeline block, then the items card beside the two side cards.
 */
export default function OrderDetailLoading() {
  return (
    <section className="mx-auto max-w-4xl px-4 py-14 sm:px-6" aria-label="Loading order">
      <Skeleton className="h-4 w-28" />
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <Skeleton className="h-8 w-56 max-w-[60%]" />
        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-6 w-24 rounded-full" />
          <Skeleton className="h-6 w-28 rounded-full" />
        </div>
      </div>

      <div className="mt-8 rounded-[2rem] bg-white p-6 shadow-soft ring-1 ring-mist-200/70">
        <Skeleton className="h-5 w-32" />
        <div className="mt-5 grid gap-4">
          {[0, 1, 2].map((step) => (
            <div key={step} className="flex items-center gap-3">
              <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
              <Skeleton className="h-4 w-48 max-w-[70%]" />
            </div>
          ))}
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="rounded-[2rem] bg-white p-6 shadow-soft ring-1 ring-mist-200/70">
          <Skeleton className="h-5 w-20" />
          <div className="mt-4 grid gap-1">
            {[0, 1, 2].map((row) => (
              <div key={row} className="flex items-center justify-between gap-3 py-3">
                <Skeleton className="h-4 w-36 max-w-[55%]" />
                <Skeleton className="h-4 w-16" />
              </div>
            ))}
          </div>
          <div className="mt-4 border-t border-brand-50 pt-4">
            <div className="flex items-center justify-between gap-4">
              <Skeleton className="h-5 w-16" />
              <Skeleton className="h-5 w-20" />
            </div>
          </div>
        </div>

        <div className="grid content-start gap-6">
          {[0, 1].map((card) => (
            <div key={card} className="rounded-[2rem] bg-white p-6 shadow-soft ring-1 ring-mist-200/70">
              <Skeleton className="h-5 w-24" />
              <SkeletonText lines={3} className="mt-3" />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
