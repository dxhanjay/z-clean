import { Skeleton, SkeletonText } from "@/components/Skeleton";

/**
 * Order route skeleton (smoothness pass) — mirrors OrderForm's main
 * layout: title, intro, then the form grid (items list + pickup fields
 * on the left, the 380px summary column on the right).
 */
export default function OrderLoading() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6" aria-label="Loading order form">
      <Skeleton className="h-10 w-64 max-w-full" />
      <SkeletonText lines={2} className="mt-4 max-w-2xl" />

      <div className="mt-10 grid items-start gap-8 lg:grid-cols-[1fr_380px]">
        <div className="grid gap-8">
          <div>
            <Skeleton className="h-6 w-40" />
            <div className="mt-4 grid gap-6">
              {[0, 1].map((group) => (
                <div key={group} className="rounded-2xl border border-brand-100 p-5">
                  <Skeleton className="h-5 w-44 max-w-full" />
                  <Skeleton className="mt-2 h-3.5 w-28" />
                  <div className="mt-3 grid gap-1">
                    {[0, 1, 2, 3].map((row) => (
                      <div key={row} className="flex items-center justify-between gap-3 py-2.5">
                        <Skeleton className="h-4 w-36 max-w-[55%]" />
                        <Skeleton className="h-9 w-24 rounded-lg" />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div>
            <Skeleton className="h-6 w-44" />
            <div className="mt-4 grid gap-5 sm:grid-cols-2">
              {[0, 1, 2, 3].map((field) => (
                <div key={field}>
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="mt-1.5 h-11 w-full rounded-xl" />
                </div>
              ))}
            </div>
          </div>
        </div>

        <aside className="rounded-2xl border border-brand-100 p-5">
          <Skeleton className="h-5 w-32" />
          <SkeletonText lines={4} className="mt-4" />
          <div className="mt-4 border-t border-brand-50 pt-4">
            <div className="flex items-center justify-between gap-4">
              <Skeleton className="h-5 w-16" />
              <Skeleton className="h-5 w-20" />
            </div>
          </div>
          <Skeleton className="mt-5 h-11 w-full rounded-full" />
        </aside>
      </div>
    </section>
  );
}
