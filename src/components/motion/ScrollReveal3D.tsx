"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { revealDelayMs, scrollMotionEnabled } from "@/lib/motion";

/**
 * Scroll-driven 3D reveal (glass + 3D scroll pass).
 *
 * A block enters the viewport tipped back in shallow 3D —
 * rotateX(10deg), dropped 36px, at quarter opacity — and settles
 * flat over ~0.85s. Siblings stagger via the `index` prop
 * (≤120ms steps, capped by revealDelayMs in src/lib/motion.ts).
 *
 * Same no-JS safety contract as Reveal: the hidden state is the
 * `reveal3d-init` class added from an effect AFTER mount, so
 * server-rendered HTML is never hidden and a JS failure leaves
 * everything visible. Reduced-motion visitors skip the init class
 * entirely and simply see the final state. The tilt folds its own
 * perspective() into the transform, keeping the component a single
 * box — no perspective wrapper changes the surrounding layout.
 * Transform + opacity only, so there is no layout shift.
 */
export default function ScrollReveal3D({
  children,
  index = 0,
  className = "",
}: {
  children: ReactNode;
  /** Position within a staggered group (0 = first). */
  index?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (
      !scrollMotionEnabled({
        prefersReducedMotion: window.matchMedia(
          "(prefers-reduced-motion: reduce)",
        ).matches,
      })
    ) {
      el.dataset.reveal3d = "shown";
      return;
    }
    el.classList.add("reveal3d-init");
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            el.dataset.reveal3d = "shown";
            el.classList.add("reveal3d-shown");
            observer.disconnect();
          }
        }
      },
      { threshold: 0.08, rootMargin: "0px 0px -6% 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const delay = revealDelayMs(index);
  return (
    <div
      ref={ref}
      className={className}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  );
}
