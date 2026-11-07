"use client";

import { useEffect, useState } from "react";
import { heroMediaMode, type HeroMediaMode } from "@/lib/motion";

/**
 * Hero visual (Phase 5, owner's animated video — 2026-11-05).
 *
 * The hero's visual is the owner's own supplied animated film: a
 * freshly pressed white shirt turning slowly on its hanger
 * (public/hero-shirt.mp4, 720×1280, 10 s loop, no audio). It
 * replaced the procedural WebGL scene the same day, at the
 * owner's direction — the scene is retired, not hidden.
 *
 * Behaviour, by rule (src/lib/motion.ts §1):
 *   - The server renders the video's poster frame as a still
 *     image in the glass showcase frame, so first paint is fast,
 *     layout never shifts, and no-JS visitors still see the shirt.
 *   - On mount, motion-allowed visitors swap the still for the
 *     autoplaying, muted, looping <video> (the poster stays as
 *     the video's own poster, so the swap is seamless).
 *   - Reduced-motion visitors keep the poster still — the video
 *     element is never mounted for them.
 *
 * The film is decorative: the headline beside it carries the
 * meaning, so the video is aria-hidden with a screen-reader-only
 * description alongside. The two annotation chips keep their
 * honest care statements from the earlier compositions, parked at
 * the frame's corners so they never cover the turning shirt.
 */

const POSTER_SRC = "/hero-shirt-poster.jpg";
const VIDEO_SRC = "/hero-shirt.mp4";

export function AnnotationChip({
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

export default function HeroShowcase() {
  const [mode, setMode] = useState<HeroMediaMode>("poster");

  useEffect(() => {
    setMode(
      heroMediaMode({
        prefersReducedMotion: window.matchMedia(
          "(prefers-reduced-motion: reduce)",
        ).matches,
      }),
    );
  }, []);

  return (
    <div className="relative mx-auto w-full max-w-[430px]">
      {/* Soft halo behind the showcase */}
      <div
        aria-hidden="true"
        className="absolute -inset-6 rounded-[3rem] bg-white/40 blur-2xl"
      />

      <div className="glass-strong relative rounded-[2rem] p-2 shadow-soft-xl ring-1 ring-white/60">
        <div className="relative aspect-[4/5] w-full overflow-hidden rounded-[1.6rem]">
          {mode === "video" ? (
            <video
              className="absolute inset-0 h-full w-full object-cover"
              src={VIDEO_SRC}
              poster={POSTER_SRC}
              autoPlay
              muted
              loop
              playsInline
              preload="metadata"
              aria-hidden="true"
            />
          ) : (
            <img
              src={POSTER_SRC}
              alt=""
              loading="eager"
              fetchPriority="high"
              className="absolute inset-0 h-full w-full object-cover"
            />
          )}
        </div>
      </div>

      <span className="sr-only">
        A freshly pressed white shirt turning slowly on its hanger —
        every Sri Clean order is washed, pressed and inspected by hand.
      </span>

      <AnnotationChip
        text="Tough stain? We treat it with care"
        className="zc-float -top-4 left-2 sm:-left-4"
      />
      <AnnotationChip
        text="Every garment inspected by hand"
        className="-bottom-4 right-2 sm:-right-4"
      />
    </div>
  );
}
