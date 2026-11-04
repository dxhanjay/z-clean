"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * Reveal-on-scroll wrapper (IntersectionObserver, fires once).
 *
 * No-JS / pre-hydration safety: the hidden state is applied by adding the
 * `reveal-init` class from an effect AFTER mount, so content is never
 * hidden in the server-rendered HTML. If JavaScript fails, everything
 * stays visible. With prefers-reduced-motion the content is shown
 * immediately with no transition.
 *
 * The wrapper also exposes `data-reveal="shown"` once visible, which the
 * How It Works connector line uses (see `.steps-line` in globals.css).
 */
export default function Reveal({
  children,
  delay = 0,
  className = "",
}: {
  children: ReactNode;
  /** Stagger delay in milliseconds, applied as transition-delay. */
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      el.dataset.reveal = "shown";
      return;
    }
    el.classList.add("reveal-init");
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            el.dataset.reveal = "shown";
            el.classList.add("reveal-shown");
            observer.disconnect();
          }
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -8% 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`reveal ${className}`}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  );
}
