/**
 * Loading placeholders (smoothness pass) — plain server-compatible
 * components with no client JS. Visuals come from the `.skeleton`
 * class in globals.css (brand-tinted shimmer, off under
 * prefers-reduced-motion).
 */

export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden="true" className={`skeleton rounded-lg ${className}`} />;
}

export default Skeleton;

/** Stacked text-line placeholders; the last line runs shorter. */
export function SkeletonText({
  lines = 3,
  className = "",
}: {
  lines?: number;
  className?: string;
}) {
  const widths = ["w-full", "w-11/12", "w-4/5", "w-3/5", "w-2/3"];
  return (
    <div aria-hidden="true" className={`grid gap-2 ${className}`}>
      {Array.from({ length: lines }, (_, i) => (
        <div
          key={i}
          className={`skeleton h-3.5 rounded-full ${
            i === lines - 1 ? widths[Math.min(3 + (i % 2), widths.length - 1)] : widths[i % 3]
          }`}
        />
      ))}
    </div>
  );
}
