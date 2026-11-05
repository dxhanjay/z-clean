import { haversineMeters, type LatLng } from "./tracking";

/**
 * Motion decisions (Phase 5 — 3D experience, Scope M) as pure,
 * testable functions. The components own the DOM/WebGL/map side
 * effects; every RULE about when motion may happen lives here:
 *
 *   1. Hero render mode — the 3D hero mounts only when the device
 *      can actually run WebGL AND the visitor has not asked for
 *      reduced motion. Every other case is the static composition.
 *   2. Card tilt — pointer-tracked CSS 3D tilt is a fine-pointer,
 *      motion-allowed enhancement only, clamped to a small angle
 *      so cards tip politely instead of flipping.
 *   3. Rider-marker transitions — the tracking marker may GLIDE
 *      between the previous and the newest RECORDED positions as
 *      a visual transition. It never moves beyond the newest real
 *      report, never follows the route line, and snaps instead of
 *      gliding when the jump is implausible for a single step
 *      (first fix, a near-identical point, a long teleport, or a
 *      reduced-motion visitor).
 *   4. Scroll-driven motion (glass + 3D scroll pass) — the hero
 *      garment turns as the hero scrolls away, homepage sections
 *      rise into place with a shallow 3D tilt, and decorative
 *      layers drift at a fraction of the scroll speed. Every rule
 *      collapses to "no motion" for reduced-motion visitors, and
 *      every number is clamped so a stray scroll value can never
 *      over-rotate, over-drift or hide content.
 *   5. Hero turntable (owner's reference videos) — the hero shirt
 *      turns on a slow, endless product turntable while the folded
 *      stack beside it only breathes a few degrees. The angle is a
 *      pure function of elapsed time with a gentle velocity ramp
 *      at load, so the loop is frame-rate independent, wraps
 *      cleanly, and — like every motion here — never runs at all
 *      for reduced-motion visitors (the scene is not mounted).
 */

/* ------------------------------------------------------------------ */
/* 1. Hero render mode                                                 */
/* ------------------------------------------------------------------ */

export type HeroRenderMode = "canvas" | "static";

export function heroRenderMode(input: {
  webglSupported: boolean;
  prefersReducedMotion: boolean;
}): HeroRenderMode {
  if (!input.webglSupported) return "static";
  if (input.prefersReducedMotion) return "static";
  return "canvas";
}

/* ------------------------------------------------------------------ */
/* 2. Card tilt                                                        */
/* ------------------------------------------------------------------ */

export const TILT_MAX_DEG = 8;

export function tiltEnabled(input: {
  pointerFine: boolean;
  prefersReducedMotion: boolean;
}): boolean {
  return input.pointerFine && !input.prefersReducedMotion;
}

export function clampTiltDeg(value: number, maxDeg: number): number {
  if (!Number.isFinite(value)) return 0;
  const cap = Math.max(0, maxDeg);
  return Math.min(cap, Math.max(-cap, value));
}

export interface TiltState {
  /** rotateX in degrees (positive tips the top away). */
  rotateXDeg: number;
  /** rotateY in degrees (positive tips the right edge away). */
  rotateYDeg: number;
  /** Sheen highlight centre, percent across the card (0–100). */
  sheenXPercent: number;
  /** Sheen highlight centre, percent down the card (0–100). */
  sheenYPercent: number;
}

/**
 * Map a pointer position inside an element to a tilt. The pointer
 * at an edge produces the maximum tilt; the centre produces none.
 * Out-of-element positions (fast pointer exits) are clamped, so
 * the card never over-rotates.
 */
export function tiltFromPointer(input: {
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
  maxDeg?: number;
}): TiltState {
  const maxDeg = input.maxDeg ?? TILT_MAX_DEG;
  const width = Math.max(1, input.width);
  const height = Math.max(1, input.height);
  const fracX = Math.min(1, Math.max(0, input.offsetX / width));
  const fracY = Math.min(1, Math.max(0, input.offsetY / height));
  return {
    rotateXDeg: clampTiltDeg((0.5 - fracY) * 2 * maxDeg, maxDeg),
    rotateYDeg: clampTiltDeg((fracX - 0.5) * 2 * maxDeg, maxDeg),
    sheenXPercent: fracX * 100,
    sheenYPercent: fracY * 100,
  };
}

/* ------------------------------------------------------------------ */
/* 3. Rider-marker transitions                                         */
/* ------------------------------------------------------------------ */

/** Glide duration between two recorded positions. */
export const MARKER_ANIMATION_MS = 1000;

/**
 * Beyond this distance a new report is not a "step" the marker can
 * honestly glide through — it is a teleport (first fix after a
 * signal gap, a far-away re-acquisition). Snap instead.
 */
export const MARKER_ANIMATE_MAX_DISTANCE_M = 1500;

/** Below this, the two reports are the same place for map purposes. */
export const MARKER_SNAP_BELOW_M = 1;

export type MarkerTransition =
  | { kind: "snap" }
  | { kind: "animate"; from: LatLng; to: LatLng; durationMs: number };

export function planMarkerTransition(
  previous: LatLng | null,
  next: LatLng,
  options?: { prefersReducedMotion?: boolean },
): MarkerTransition {
  if (!previous) return { kind: "snap" };
  if (options?.prefersReducedMotion) return { kind: "snap" };
  const distance = haversineMeters(previous, next);
  if (!Number.isFinite(distance)) return { kind: "snap" };
  if (distance < MARKER_SNAP_BELOW_M) return { kind: "snap" };
  if (distance > MARKER_ANIMATE_MAX_DISTANCE_M) return { kind: "snap" };
  return {
    kind: "animate",
    from: { lat: previous.lat, lng: previous.lng },
    to: { lat: next.lat, lng: next.lng },
    durationMs: MARKER_ANIMATION_MS,
  };
}

export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export function easeInOutCubic(t: number): number {
  const x = clamp01(t);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

/** Linear interpolation between two recorded points, t clamped. */
export function interpolateLatLng(from: LatLng, to: LatLng, t: number): LatLng {
  const k = clamp01(t);
  return {
    lat: from.lat + (to.lat - from.lat) * k,
    lng: from.lng + (to.lng - from.lng) * k,
  };
}

/** The marker's visual position part-way through a glide. */
export function markerPositionAt(
  from: LatLng,
  to: LatLng,
  elapsedMs: number,
  durationMs: number,
): LatLng {
  if (durationMs <= 0) return { lat: to.lat, lng: to.lng };
  const eased = easeInOutCubic(elapsedMs / durationMs);
  return interpolateLatLng(from, to, eased);
}

/* ------------------------------------------------------------------ */
/* 4. Scroll-driven motion (glass + 3D scroll pass)                    */
/* ------------------------------------------------------------------ */

/**
 * The single gate for every scroll-driven effect in this section:
 * a reduced-motion preference switches ALL of it off — reveals sit
 * in their final state, parallax never translates, and the hero
 * garment keeps only its idle levitation/parallax.
 */
export function scrollMotionEnabled(input: {
  prefersReducedMotion: boolean;
}): boolean {
  return !input.prefersReducedMotion;
}

/* ---- Hero scroll progress + garment rotation ---- */

/** Radians of Y rotation the garment group earns over a full hero scroll. */
export const HERO_SCROLL_MAX_ROTATION_Y = 0.55;

/** Radians of X tilt at full hero scroll — a slight lean, never a flip. */
export const HERO_SCROLL_MAX_TILT_X = 0.08;

/**
 * How far the visitor has scrolled THROUGH the hero, 0–1, from the
 * hero wrapper's viewport rect: 0 while its top is at or below the
 * viewport top, 1 once it has scrolled a full hero-height past.
 * Degenerate inputs (zero height, NaNs from a detached node) are 0.
 */
export function heroScrollProgress(input: {
  heroTop: number;
  heroHeight: number;
}): number {
  if (!Number.isFinite(input.heroTop) || !Number.isFinite(input.heroHeight)) {
    return 0;
  }
  if (input.heroHeight <= 0) return 0;
  return clamp01(-input.heroTop / input.heroHeight);
}

/** Rotation the hero garment group should hold at a scroll progress. */
export function heroScrollRotation(progress: number): {
  rotationY: number;
  rotationX: number;
} {
  const p = clamp01(progress);
  return {
    rotationY: HERO_SCROLL_MAX_ROTATION_Y * p,
    rotationX: HERO_SCROLL_MAX_TILT_X * p,
  };
}

/**
 * Module-level scroll-progress channel between HeroShowcase (which
 * owns the scroll listener) and the hero scene's frame loop (which
 * reads it every frame without re-rendering React). Deliberately a
 * plain mutable holder — no state library for one number.
 */
export const heroScrollState = { progress: 0 };

export function setHeroScrollProgress(value: number): void {
  heroScrollState.progress = clamp01(value);
}

export function getHeroScrollProgress(): number {
  return heroScrollState.progress;
}

/* ---- Section reveal (ScrollReveal3D) ---- */

/** Default stagger step between sibling reveals, ms. */
export const REVEAL_STAGGER_STEP_MS = 120;

/** Stagger never delays a block by more than this, ms. */
export const REVEAL_STAGGER_MAX_MS = 600;

/**
 * Transition delay for the nth block in a staggered reveal group.
 * Non-positive / non-finite indexes reveal immediately.
 */
export function revealDelayMs(
  index: number,
  stepMs: number = REVEAL_STAGGER_STEP_MS,
  maxMs: number = REVEAL_STAGGER_MAX_MS,
): number {
  if (!Number.isFinite(index) || index <= 0) return 0;
  const step = Number.isFinite(stepMs) && stepMs > 0 ? stepMs : 0;
  const cap = Number.isFinite(maxMs) && maxMs > 0 ? maxMs : 0;
  return Math.min(Math.floor(index) * step, cap);
}

/* ---- Parallax layers ---- */

/** A parallax layer never drifts further than this from its place, px. */
export const PARALLAX_MAX_OFFSET_PX = 480;

/**
 * Vertical drift for a decorative layer: a small fraction of the
 * scroll position, hard-clamped so a very long page can never push
 * a layer off its stage. Non-finite inputs drift nowhere.
 */
export function parallaxOffset(
  scrollY: number,
  speed: number,
  maxAbsPx: number = PARALLAX_MAX_OFFSET_PX,
): number {
  if (!Number.isFinite(scrollY) || !Number.isFinite(speed)) return 0;
  const cap =
    Number.isFinite(maxAbsPx) && maxAbsPx > 0 ? maxAbsPx : PARALLAX_MAX_OFFSET_PX;
  const raw = scrollY * speed;
  return Math.min(cap, Math.max(-cap, raw));
}

/**
 * Parallax runs only when motion is allowed AND there is at least
 * one layer to move — the scroll listener is never even attached
 * for an empty page.
 */
export function parallaxEnabled(input: {
  prefersReducedMotion: boolean;
  targetCount: number;
}): boolean {
  if (!scrollMotionEnabled(input)) return false;
  return Number.isFinite(input.targetCount) && input.targetCount > 0;
}

/* ------------------------------------------------------------------ */
/* 5. Hero turntable (owner's reference videos)                        */
/* ------------------------------------------------------------------ */

/** Seconds per full turntable revolution — slow, showroom pace. */
export const TURNTABLE_PERIOD_S = 28;

/** Turntable angular speed at full pace, rad/s (≈0.224). */
export const TURNTABLE_ANGULAR_SPEED = (Math.PI * 2) / TURNTABLE_PERIOD_S;

/** Seconds over which the turntable eases in from rest at load. */
export const TURNTABLE_EASE_IN_S = 1.5;

/**
 * Turntable angle (radians, wrapped to [0, 2π)) at an elapsed
 * time in seconds, derived purely from the clock — never from
 * accumulated per-frame state, so pausing the render loop (hero
 * off-screen, tab hidden) pauses the turntable with it.
 *
 * Ease-in: the angular velocity ramps linearly from 0 to full
 * pace over the first `easeInS` seconds, so the shirt never
 * jolts into motion on load. Integrating that ramp, the angle
 * trails the full-pace angle by exactly half the ramp: during
 * the ramp angle = ω·t²/(2T); afterwards angle = ω·(t − T/2).
 * Non-finite or negative elapsed times sit at the front view.
 */
export function turntableAngleAt(
  elapsedSeconds: number,
  options?: { periodS?: number; easeInS?: number },
): number {
  if (!Number.isFinite(elapsedSeconds) || elapsedSeconds <= 0) return 0;
  const period =
    options?.periodS !== undefined &&
    Number.isFinite(options.periodS) &&
    options.periodS > 0
      ? options.periodS
      : TURNTABLE_PERIOD_S;
  const easeIn =
    options?.easeInS !== undefined &&
    Number.isFinite(options.easeInS) &&
    options.easeInS >= 0
      ? options.easeInS
      : TURNTABLE_EASE_IN_S;
  const omega = (Math.PI * 2) / period;
  const t = elapsedSeconds;
  const effective =
    easeIn > 0 && t < easeIn ? (t * t) / (2 * easeIn) : t - easeIn / 2;
  const angle = (omega * effective) % (Math.PI * 2);
  return angle < 0 ? angle + Math.PI * 2 : angle;
}

/** The folded stack never turns — it only breathes this far. */
export const STACK_SWAY_MAX_RAD = 0.06;

/** Seconds per full counter-sway cycle of the folded stack. */
export const STACK_SWAY_PERIOD_S = 90;

/**
 * The folded stack's counter-drift: a very slow sinusoid bounded
 * by ±STACK_SWAY_MAX_RAD, so the stack grounds the composition
 * while the shirt turns beside it. Non-finite time → at rest.
 */
export function stackSwayAngleAt(elapsedSeconds: number): number {
  if (!Number.isFinite(elapsedSeconds)) return 0;
  return (
    STACK_SWAY_MAX_RAD *
    Math.sin((elapsedSeconds * Math.PI * 2) / STACK_SWAY_PERIOD_S)
  );
}
