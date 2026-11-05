import { services } from "@/lib/services";

/**
 * Infinite marquee strip of service names separated by ✦, in the style of
 * the Laundra reference. The list is rendered twice for a seamless -50%
 * loop; animation pauses on hover and is disabled for reduced motion
 * (see `.marquee-track` in globals.css).
 */
export default function Marquee() {
  const names = services.map((s) => s.name);
  return (
    <div
      className="marquee overflow-hidden border-y border-mist-200 bg-white/70 py-4"
      aria-hidden="true"
    >
      <div className="marquee-track flex w-max items-center">
        {[0, 1].map((copy) => (
          <div key={copy} className="flex items-center">
            {names.map((name) => (
              <span
                key={`${copy}-${name}`}
                className="flex items-center whitespace-nowrap text-sm font-bold uppercase tracking-widest text-ink-700"
              >
                <span className="px-5">{name}</span>
                <span className="text-brand-400">✦</span>
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
