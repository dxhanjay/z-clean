"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { heroImages } from "@/lib/media";

const ROTATE_MS = 5500;

/**
 * Auto-rotating hero slider: crossfading photos with a subtle Ken Burns
 * zoom, clickable dots, pause on hover/focus, and no auto-rotation when
 * the visitor prefers reduced motion.
 */
export default function HeroSlider() {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const advance = useCallback(() => {
    setIndex((i) => (i + 1) % heroImages.length);
  }, []);

  useEffect(() => {
    if (paused || reducedMotion) return;
    timer.current = setInterval(advance, ROTATE_MS);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [advance, paused, reducedMotion]);

  return (
    <div
      className="relative aspect-[4/3] w-full overflow-hidden rounded-3xl shadow-lg sm:aspect-[16/11]"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      role="group"
      aria-roledescription="carousel"
      aria-label="Z-clean in pictures"
    >
      {heroImages.map((image, i) => (
        <img
          key={image.src}
          src={image.src}
          alt={image.alt}
          loading={i === 0 ? "eager" : "lazy"}
          aria-hidden={i !== index}
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-1000 ${
            i === index ? "kenburns opacity-100" : "opacity-0"
          }`}
        />
      ))}
      <div className="absolute inset-x-0 bottom-0 flex justify-center gap-2 bg-gradient-to-t from-ink-900/40 to-transparent pb-4 pt-10">
        {heroImages.map((image, i) => (
          <button
            key={image.src}
            type="button"
            onClick={() => setIndex(i)}
            aria-label={`Show photo ${i + 1}: ${image.alt}`}
            aria-current={i === index}
            className={`h-2.5 rounded-full transition-all duration-300 ${
              i === index ? "w-7 bg-white" : "w-2.5 bg-white/60 hover:bg-white"
            }`}
          />
        ))}
      </div>
    </div>
  );
}
