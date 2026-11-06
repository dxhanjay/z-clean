import { haversineMeters, type LatLng } from "./tracking";

/**
 * Motion decisions (Phase 5) as pure, testable functions. The
 * components own the DOM/map side effects; every RULE about when
 * motion may happen lives here:
 *
 *   1. Hero media mode — the hero is the owner's supplied animated
 *      video (an earlier WebGL scene was retired on 2026-11-05 by
 *      the owner's decision). The video autoplays only when the
 *      visitor has not asked for reduced motion; reduced-motion
 *      visitors get the video's poster frame as a still image,
 *      and the server render is that poster for everyone (no
 *      layout shift, no-JS safe).
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
 *   4. Scroll-driven motion (glass + 3D scroll pass) — homepage
 *      sections rise into place with a shallow 3D tilt, and
 *      decorative layers drift at a fraction of the scroll speed.
 *      Every rule collapses to "no motion" for reduced-motion
 *      visitors, and every number is clamped so a stray scroll
 *      value can never over-drift or hide content.
 */

/* ------------------------------------------------------------------ */
/* 1. Hero media mode                                                  */
/* ------------------------------------------------------------------ */

export type HeroMediaMode = "video" | "poster";

export function heroMediaMode(input: {
  prefersReducedMotion: boolean;
}): HeroMediaMode {
  return input.prefersReducedMotion ? "poster" : "video";
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
 * in their final state and parallax never translates.
 */
export function scrollMotionEnabled(input: {
  prefersReducedMotion: boolean;
}): boolean {
  return !input.prefersReducedMotion;
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
/* 5. Staff app (Web3D UI + operability pass)                         */
/* ------------------------------------------------------------------ */

/**
 * One leg of a round, as the rider experiences it. The two steps
 * are the leg's own: travel first, then the doorstep handover.
 * The order's full inside-the-plant lifecycle is NOT the rider's
 * progress — their work is these two steps and nothing else.
 */
export type StaffLegStepId = "travel" | "handover";

export interface StaffLegStep {
  id: StaffLegStepId;
  label: string;
  state: "done" | "current" | "upcoming";
}

/**
 * The leg-progress rule behind the staff detail page's stepper:
 *
 *   - `h arrived` (after handover) → both steps done, fill 100%.
 *   - awaiting this leg → Travel is current (the rider heads out;
 *     the handover unlocks when the order reaches their step),
 *     fill 0%.
 *   - order AT this leg, no handover yet → Travel is DONE (the
 *     rider provably got there — the code entry is open only at
 *     the door) and Handover is current, fill 50%.
 *
 * Derived only from `awaitingThisLeg` (the tasks API's own
 * verdict) — no position or status is invented here.
 */
export function staffLegSteps(input: {
  arrived: boolean;
  awaitingThisLeg: boolean;
}): StaffLegStep[] {
  if (input.arrived) {
    return [
      { id: "travel", label: "Travel", state: "done" },
      { id: "handover", label: "Handover", state: "done" },
    ];
  }
  if (input.awaitingThisLeg) {
    return [
      { id: "travel", label: "Travel", state: "current" },
      { id: "handover", label: "Handover", state: "upcoming" },
    ];
  }
  return [
    { id: "travel", label: "Travel", state: "done" },
    { id: "handover", label: "Handover", state: "current" },
  ];
}

/** Fill fraction (0–1) for the leg progress bar between the steps. */
export function staffLegProgress(input: {
  arrived: boolean;
  awaitingThisLeg: boolean;
}): number {
  if (input.arrived) return 1;
  if (input.awaitingThisLeg) return 0;
  return 0.5;
}

/** The rider's next round: the FIRST task still awaiting its leg. */
export function nextTaskId(
  tasks: readonly { assignmentId: string; awaitingThisLeg: boolean }[],
): string | null {
  return tasks.find((t) => t.awaitingThisLeg)?.assignmentId ?? null;
}

/** How many pings of a sharing session have failed in a row. */
export interface PingFailureStreak {
  /** Consecutive failed send attempts since the last success. */
  failures: number;
  /** True while the streak deserves a *visible* retry message. */
  showRetry: boolean;
}

/**
 * Ping-retry messaging rule (staff Share Location panel): a single
 * blip stays silent — the note would flicker on healthy rounds.
 * From the SECOND consecutive failure the panel says it is
 * retrying; any success resets the count to zero. Pure counter —
 * the panel owns the fetch and the watch, this owns the rule.
 */
export function pingFailureStreak(
  previous: number,
  outcome: "sent" | "failed",
): PingFailureStreak {
  if (outcome === "sent") return { failures: 0, showRetry: false };
  const failures =
    (Number.isFinite(previous) && previous > 0 ? Math.floor(previous) : 0) + 1;
  return { failures, showRetry: failures >= 2 };
}

/** Shape raw input into the OTP boxes: digits only, at most `length`. */
export function otpDigits(value: string, length = 6): string {
  return (value ?? "").replace(/\D/g, "").slice(0, Math.max(0, length));
}

/**
 * Distribute typed/pasted digits across the OTP boxes starting at
 * `startIndex`. The boxes themselves stay dumb: this pure function
 * decides the new contents and which box takes focus next (the
 * first still-empty box after the pasted run, capped at the last
 * box — so a full paste lands focus on box 6, ready to submit).
 */
export function otpApplyInput(
  boxes: readonly string[],
  startIndex: number,
  rawValue: string,
): { boxes: string[]; focusIndex: number } {
  const next = boxes.map((b) => otpDigits(b, 1));
  const digits = otpDigits(rawValue, next.length);
  const start = Math.min(
    Math.max(0, Math.floor(startIndex) || 0),
    Math.max(0, next.length - 1),
  );
  let written = 0;
  for (let i = 0; i < digits.length && start + i < next.length; i++) {
    next[start + i] = digits[i];
    written++;
  }
  return {
    boxes: next,
    focusIndex: Math.min(start + Math.max(written, 1), next.length - 1),
  };
}
