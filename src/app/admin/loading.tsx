import { Skeleton, SkeletonText } from "@/components/Skeleton";

/**
 * Admin route skeleton (smoothness pass). This single file sits at the
 * admin root, so Next.js applies it to /admin and to every admin
 * subpage that does not ship its own loading.tsx — it mirrors the
 * shared admin page shell (title, intro, filter pills, card rows).
 */
export default function AdminLoading() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-14" aria-label="Loading admin">
      <Skeleton className="h-8 w-56 max-w-full" />
      <SkeletonText lines={2} className="mt-3 max-w-2xl" />

      <div className="mt-8 flex flex-wrap gap-2">
        {[0, 1, 2, 3].map((pill) => (
          <Skeleton key={pill} className="h-11 w-28 rounded-full" />
        ))}
      </div>

      <ul className="mt-6 grid gap-3">
        {[0, 1, 2, 3].map((row) => (
          <li key={row} className="rounded-2xl border border-brand-100 p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Skeleton className="h-5 w-44 max-w-[55%]" />
              <Skeleton className="h-6 w-20 rounded-full" />
            </div>
            <SkeletonText lines={2} className="mt-3" />
          </li>
        ))}
      </ul>
    </section>
  );
}
