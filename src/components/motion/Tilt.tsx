"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { tiltEnabled, tiltFromPointer } from "@/lib/motion";

/**
 * Pointer-tracked CSS 3D tilt wrapper (Phase 5, Scope M).
 *
 * A fine pointer moving over the card tips it a few degrees toward
 * the cursor and sweeps a soft sheen across its face; leaving
 * settles it back flat. The RULES live in src/lib/motion.ts
 * (tiltEnabled / tiltFromPointer): coarse pointers and
 * reduced-motion visitors never get handlers that do anything,
 * and the angle is clamped to ±8°.
 *
 * Implementation notes:
 *   - Styles are written straight to the DOM node (no React state
 *     per pointermove), and the transform is composed HERE — the
 *     wrapped card keeps its own hover lift/shadow untouched.
 *   - The sheen is a sibling overlay clipped by its own border
 *     radius, pointer-events-none, so it can never block the
 *     card's link or steal focus. Keyboard focus is untouched.
 */
export default function Tilt({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const sheenRef = useRef<HTMLDivElement | null>(null);
  const enabledRef = useRef(false);

  useEffect(() => {
    enabledRef.current = tiltEnabled({
      pointerFine: window.matchMedia("(pointer: fine)").matches,
      prefersReducedMotion: window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches,
    });
  }, []);

  function handleMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!enabledRef.current || event.pointerType === "touch") return;
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const tilt = tiltFromPointer({
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      width: rect.width,
      height: rect.height,
    });
    el.style.transform =
      `perspective(1000px) rotateX(${tilt.rotateXDeg.toFixed(2)}deg) ` +
      `rotateY(${tilt.rotateYDeg.toFixed(2)}deg)`;
    const sheen = sheenRef.current;
    if (sheen) {
      sheen.style.background =
        `radial-gradient(420px circle at ${tilt.sheenXPercent.toFixed(1)}% ` +
        `${tilt.sheenYPercent.toFixed(1)}%, rgb(255 255 255 / 0.32), transparent 65%)`;
      sheen.style.opacity = "1";
    }
  }

  function handleLeave() {
    const el = ref.current;
    if (el) el.style.transform = "";
    if (sheenRef.current) sheenRef.current.style.opacity = "0";
  }

  return (
    <div
      ref={ref}
      onPointerMove={handleMove}
      onPointerLeave={handleLeave}
      className={`zc-tilt ${className}`}
    >
      {children}
      <div
        ref={sheenRef}
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-10 rounded-[inherit] opacity-0 transition-opacity duration-300"
      />
    </div>
  );
}
