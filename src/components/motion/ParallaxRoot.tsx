"use client";

import { useEffect } from "react";
import { parallaxEnabled, parallaxOffset } from "@/lib/motion";

/**
 * Continuous parallax driver (glass + 3D scroll pass), mounted
 * once on the homepage.
 *
 * ONE passive scroll listener for the whole page: every element
 * carrying data-parallax="<speed>" (the ambient orbs, the hero's
 * soft blobs) is translated by scrollY × speed, transform-only,
 * inside a rAF throttle so a scroll burst costs at most one style
 * write per frame. Offsets are clamped by parallaxOffset in
 * src/lib/motion.ts, so a long page can never push a layer off its
 * stage. Reduced-motion visitors — and pages with no targets —
 * never get the listener at all. Renders nothing.
 */
export default function ParallaxRoot() {
  useEffect(() => {
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const targets = Array.from(
      document.querySelectorAll<HTMLElement>("[data-parallax]"),
    );
    if (!parallaxEnabled({ prefersReducedMotion: reduced, targetCount: targets.length })) {
      return;
    }

    let raf = 0;
    let scheduled = false;
    const update = () => {
      scheduled = false;
      const y = window.scrollY;
      for (const el of targets) {
        const speed = Number.parseFloat(el.dataset.parallax ?? "");
        if (!Number.isFinite(speed) || speed === 0) continue;
        el.style.transform = `translate3d(0, ${parallaxOffset(y, speed).toFixed(1)}px, 0)`;
      }
    };
    const onScroll = () => {
      if (!scheduled) {
        scheduled = true;
        raf = window.requestAnimationFrame(update);
      }
    };

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (raf) window.cancelAnimationFrame(raf);
    };
  }, []);

  return null;
}
