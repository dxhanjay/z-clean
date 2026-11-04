import { Skeleton, SkeletonText } from "@/components/Skeleton";

/**
 * Admin route skeleton (smoothness pass; geometry updated in the
 * admin redesign). This single file sits at the admin root, so
 * Next.js applies it to /admin and to every admin subpage that does
 * not ship its own loading.tsx. It renders inside the AdminShell
 * content column, which already provides width and padding, and
 * mirrors a section page: title, intro, filter pills, card rows.
 */
export default function AdminLoading() {
  return (
    <section aria-label="Loading admin">
      <Skeleton className="h-8 w-56 max-w-full" />
      <SkeletonText lines={2} className="mt-3 max-w-2xl" />

      <div className="mt-8 flex flex-wrap gap-2">
        {[0, 1, 2, 3].map((pill) => (
          <Skeleton key={pill} className="h-11 w-28 rounded-full" />
        ))}
      </div>

      <ul className="mt-6 grid gap-3">
        {[0, 1, 2, 3].map((row) => (
          <li key={row} className="rounded-xl border border-admin-border bg-white p-4 sm:p-5">
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
