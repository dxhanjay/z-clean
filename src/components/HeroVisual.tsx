import { aboutImages, heroImages } from "@/lib/media";

/**
 * Hero garment composition (Phase A redesign) — a layered, gently
 * floating arrangement in the CleanPro reference's language: one
 * large garment photo, a smaller handover photo card overlapping the
 * corner, and two hand-annotation-style chips. The chips carry honest
 * care statements about the real process (stain treatment, hand
 * inspection) — no ratings, counts, or guarantees. Motion is
 * transform-only and disabled for reduced-motion visitors (see
 * `.zc-float` in globals.css).
 */

function AnnotationChip({
  text,
  className,
}: {
  text: string;
  className: string;
}) {
  return (
    <p
      className={`glass-panel absolute z-10 flex max-w-[11rem] items-start gap-2 rounded-2xl px-3.5 py-2.5 text-xs font-semibold leading-snug text-ink-700 shadow-soft ring-1 ring-white/70 sm:max-w-[12rem] sm:text-[13px] ${className}`}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-600"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      >
        <path d="M4 16c3-1 4-6 8-8 3-1.5 6-1 8-3-1 3-3 4-6 5 3 1 4 3 5 6-3-2-6-2-9 0-3 2-5 2-6 0Z" />
      </svg>
      {text}
    </p>
  );
}

export default function HeroVisual() {
  const [main, secondary] = heroImages;
  const folded = aboutImages[2];
  return (
    <div className="relative mx-auto w-full max-w-xl lg:max-w-none">
      {/* Soft halo behind the composition */}
      <div
        aria-hidden="true"
        className="absolute -inset-6 rounded-[3rem] bg-white/40 blur-2xl"
      />
      <div className="zc-float relative overflow-hidden rounded-[2.5rem] shadow-soft-xl ring-1 ring-white/60">
        <img
          src={main.src}
          alt={main.alt}
          loading="eager"
          fetchPriority="high"
          className="aspect-[4/3] w-full object-cover sm:aspect-[16/11]"
        />
      </div>

      <AnnotationChip
        text="Tough stain? We treat it with care"
        className="-top-4 left-4 sm:-left-4"
      />
      <AnnotationChip
        text="Every garment inspected by hand"
        className="right-4 top-1/3 sm:-right-3"
      />

      <div className="zc-float-slow absolute -bottom-8 -left-3 hidden w-44 overflow-hidden rounded-[1.75rem] shadow-soft-lg ring-4 ring-white sm:block lg:-left-8 lg:w-52">
        <img
          src={secondary.src}
          alt={secondary.alt}
          loading="lazy"
          className="aspect-[4/3] w-full object-cover"
        />
      </div>
      <div className="glass-panel absolute -bottom-5 right-4 hidden items-center gap-3 rounded-2xl py-2.5 pl-2.5 pr-4 shadow-soft ring-1 ring-white/70 md:flex">
        <img
          src={folded.src}
          alt={folded.alt}
          loading="lazy"
          className="h-11 w-11 rounded-xl object-cover"
        />
        <p className="text-xs font-semibold leading-snug text-ink-700">
          Washed separately,
          <br />
          never mixed loads
        </p>
      </div>
    </div>
  );
}
