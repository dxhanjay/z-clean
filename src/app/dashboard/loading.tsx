import { Skeleton, SkeletonText } from "@/components/Skeleton";

/**
 * Dashboard route skeleton (smoothness pass) — mirrors DashboardPage:
 * greeting, intro, the three action cards, then the orders list
 * section and the panels section below it.
 */
export default function DashboardLoading() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6" aria-label="Loading dashboard">
      <Skeleton className="h-9 w-80 max-w-full" />
      <SkeletonText lines={1} className="mt-3 max-w-2xl" />

      <div className="mt-8 grid gap-6 sm:grid-cols-3">
        {[0, 1, 2].map((card) => (
          <div key={card} className="rounded-2xl border border-brand-100 p-6">
            <Skeleton className="h-5 w-32 max-w-full" />
            <SkeletonText lines={2} className="mt-3" />
            <Skeleton className="mt-4 h-10 w-36 rounded-full" />
          </div>
        ))}
      </div>

      <div className="mt-10">
        <Skeleton className="h-6 w-44" />
        <ul className="mt-4 grid gap-3">
          {[0, 1, 2].map((row) => (
            <li key={row} className="rounded-2xl border border-brand-100 p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Skeleton className="h-5 w-40 max-w-[55%]" />
                <Skeleton className="h-6 w-20 rounded-full" />
              </div>
              <SkeletonText lines={2} className="mt-3" />
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-10 grid gap-6 lg:grid-cols-2">
        {[0, 1].map((panel) => (
          <div key={panel} className="rounded-2xl border border-brand-100 p-6">
            <Skeleton className="h-5 w-36 max-w-full" />
            <SkeletonText lines={3} className="mt-3" />
          </div>
        ))}
      </div>
    </section>
  );
}
