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
