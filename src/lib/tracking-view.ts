/**
 * Customer live-tracking VIEW logic (Phase D) — the pure rules
 * behind the order page's live map card and its 12-stage timeline.
 *
 * Everything here is a function of data the server already proved:
 * the tracking feed (GET /api/tracking/[orderId] — latest REAL rider
 * ping, current assignment, geocoded pins), the order's status
 * history, and its recorded handover milestones. Nothing in this
 * module invents a position, a stage, or a number:
 *
 *   - The map card exists ONLY while a leg is genuinely live
 *     (active assignment + the matching order status). No rider
 *     assigned → no card, never a decorative map.
 *   - A position is "live" for 3 minutes after it was recorded;
 *     older than that the card says so ("stale") instead of
 *     implying the rider is still moving.
 *   - Distance is the haversine between the rider's last real ping
 *     and the customer's geocoded address — shown only when BOTH
 *     exist. The ETA comes from the OSRM public router and is
 *     shown only when OSRM actually returned a duration for those
 *     same two points; any failure hides the chip.
 *   - The 12 presentation stages map onto the canonical lifecycle
 *     (src/lib/order-flow.ts) + the handover chain's plant points
 *     (src/lib/handovers.ts). One honest wrinkle: the plant records
 *     ONE "Processing" handover for the wash cycle, and drying is
 *     part of that cycle (careStages' "Processing" = washed or dry
 *     cleaned) — there is no separate drying handover to sense.
 *     So "Drying" completes together with "Washing" at the
 *     Processing handover and never poses as the current stage on
 *     its own. "Ironing" is the chain's Finishing stage (the
 *     ironing staff's handover to Quality Check).
 *
 * Dependency-light on purpose (order-flow + tracking only, both
 * pure) so scripts/test-tracking-view.mjs can compile it alone.
 */

import { stepIndex } from "./order-flow";
import { haversineMeters, isValidCoordinate, type LatLng } from "./tracking";

/* ------------------------------------------------------------------ */
/* Feed shapes — mirror GET /api/tracking/[orderId] exactly.           */
/* ------------------------------------------------------------------ */

export interface TrackingPosition extends LatLng {
  accuracyM: number | null;
  recordedAt: string; // ISO
}

export interface TrackingAssignment {
  leg: string;
  state: string; // "active" | "completed"
  riderFirstName: string | null;
  assignedAt: string;
  completedAt: string | null;
}

export interface TrackingFeed {
  order: { id: string; ref: string; status: string };
  assignment: TrackingAssignment | null;
  latestPosition: TrackingPosition | null;
  lastPingAt: string | null;
  facility: { name: string; lat: number; lng: number } | null;
  destination: LatLng | null;
}

/* ------------------------------------------------------------------ */
/* The card's visibility state machine.                                */
/* ------------------------------------------------------------------ */

/** Poll cadence for the tracking feed (realtime rides on top). */
export const TRACKING_POLL_MS = 20_000;

/** A ping older than this is reported as paused, not live. */
export const TRACKING_STALE_AFTER_MS = 180_000;

export type TrackingLegContext = "pickup" | "delivery";

/**
 * Which leg is live for this order right now, if any: an ACTIVE
 * assignment whose leg matches where the order actually is in its
 * lifecycle. A pickup rider matters while the order waits for
 * pickup; a delivery rider only once the order is out for delivery.
 * Anything else (no assignment, completed assignment, leg/status
 * mismatch) means tracking is not on offer for this order yet.
 */
export function activeLegForStatus(
  status: string,
  assignment: TrackingAssignment | null | undefined,
): TrackingLegContext | null {
  if (!assignment || assignment.state !== "active") return null;
  if (
    assignment.leg === "pickup" &&
    (status === "PLACED" || status === "PICKUP_SCHEDULED")
  ) {
    return "pickup";
  }
  if (assignment.leg === "delivery" && status === "OUT_FOR_DELIVERY") {
    return "delivery";
  }
  return null;
}

export type TrackingCardState =
  | { kind: "hidden" }
  | {
      kind: "waiting" | "live" | "stale";
      leg: TrackingLegContext;
      riderFirstName: string | null;
      position: TrackingPosition | null;
      lastPingAt: string | null;
    };

/**
 * hidden  — no live leg: render nothing (never a fake map).
 * waiting — leg assigned, rider has not shared a position yet.
 * live    — a position no older than TRACKING_STALE_AFTER_MS.
 * stale   — a position exists but is older: show it, labelled as
 *           the last reported one, with updates marked paused.
 * An unparseable timestamp can never prove freshness → stale.
 * A timestamp slightly in the future (clock skew) counts as live.
 */
export function trackingCardState(input: {
  status: string;
  assignment: TrackingAssignment | null | undefined;
  latestPosition: TrackingPosition | null | undefined;
  nowMs: number;
}): TrackingCardState {
  const leg = activeLegForStatus(input.status, input.assignment);
  if (!leg) return { kind: "hidden" };
  const base = {
    leg,
    riderFirstName: input.assignment?.riderFirstName ?? null,
    position: input.latestPosition ?? null,
    lastPingAt: input.latestPosition?.recordedAt ?? null,
  };
  if (!input.latestPosition) return { kind: "waiting", ...base };
  const recordedMs = Date.parse(input.latestPosition.recordedAt);
  if (
    Number.isNaN(recordedMs) ||
    input.nowMs - recordedMs > TRACKING_STALE_AFTER_MS
  ) {
    return { kind: "stale", ...base };
  }
  return { kind: "live", ...base };
}

/* ------------------------------------------------------------------ */
/* Merging positions: realtime inserts + poll results race; the        */
/* NEWER recordedAt always wins, regardless of arrival order.          */
/* ------------------------------------------------------------------ */

export function mergeLatestPosition(
  current: TrackingPosition | null,
  incoming: TrackingPosition | null,
): TrackingPosition | null {
  if (!incoming) return current;
  if (!current) return incoming;
  const incomingMs = Date.parse(incoming.recordedAt);
  if (Number.isNaN(incomingMs)) return current;
  const currentMs = Date.parse(current.recordedAt);
  if (Number.isNaN(currentMs)) return incoming;
  return incomingMs >= currentMs ? incoming : current;
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/**
 * Shape a Supabase Realtime row from rider_locations (numeric
 * columns may arrive as strings) into a TrackingPosition, or null
 * when the row is unusable. A row that fails validation must never
 * reach the map.
 */
export function parseRealtimePosition(row: unknown): TrackingPosition | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  const lat = toFiniteNumber(r.lat);
  const lng = toFiniteNumber(r.lng);
  if (lat === null || lng === null || !isValidCoordinate(lat, lng)) {
    return null;
  }
  const recordedAt = typeof r.recorded_at === "string" ? r.recorded_at : null;
  if (!recordedAt || Number.isNaN(Date.parse(recordedAt))) return null;
  return {
    lat,
    lng,
    accuracyM: toFiniteNumber(r.accuracy_m),
    recordedAt,
  };
}

/* ------------------------------------------------------------------ */
/* Info chips — every value is either real or null (chip hidden).      */
/* ------------------------------------------------------------------ */

export function formatDistanceMeters(meters: number): string {
  if (!Number.isFinite(meters) || meters < 0) return "";
  if (meters < 1000) return `${Math.round(meters)} m`;
  const km = meters / 1000;
  return `${km >= 10 ? Math.round(km) : km.toFixed(1).replace(/\.0$/, "")} km`;
}

export function formatEtaSeconds(totalSeconds: number): string {
  const minutes = Math.max(1, Math.round(totalSeconds / 60));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest > 0 ? `${hours} hr ${rest} min` : `${hours} hr`;
}

export function formatLastUpdated(sec: number): string {
  if (!Number.isFinite(sec) || sec < 10) return "just now";
  if (sec < 60) return `${Math.floor(sec)} sec ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)} min ago`;
  return `${Math.floor(sec / 3600)} hr ago`;
}

export interface TrackingChips {
  /** Haversine rider→destination; null unless BOTH points exist. */
  distanceMeters: number | null;
  distanceLabel: string | null;
  /** OSRM duration; null unless OSRM returned one for these points. */
  etaSeconds: number | null;
  etaLabel: string | null;
  lastUpdatedSec: number | null;
  lastUpdatedLabel: string | null;
}

export function deriveTrackingChips(input: {
  rider: LatLng | null | undefined;
  destination: LatLng | null | undefined;
  osrmDurationSec: number | null | undefined;
  lastPingAt: string | null | undefined;
  nowMs: number;
}): TrackingChips {
  const rider = input.rider ?? null;
  const destination = input.destination ?? null;

  let distanceMeters: number | null = null;
  if (rider && destination) {
    distanceMeters = haversineMeters(rider, destination);
  }

  // The ETA is OSRM's road duration between the SAME two points.
  // No points, no OSRM answer, or a non-positive duration (the
  // rider is effectively at the door) → the chip simply hides.
  let etaSeconds: number | null = null;
  if (
    rider &&
    destination &&
    typeof input.osrmDurationSec === "number" &&
    Number.isFinite(input.osrmDurationSec) &&
    input.osrmDurationSec > 0
  ) {
    etaSeconds = input.osrmDurationSec;
  }

  let lastUpdatedSec: number | null = null;
  if (input.lastPingAt) {
    const pingMs = Date.parse(input.lastPingAt);
    if (!Number.isNaN(pingMs)) {
      lastUpdatedSec = Math.max(0, Math.floor((input.nowMs - pingMs) / 1000));
    }
  }

  return {
    distanceMeters,
    distanceLabel:
      distanceMeters !== null ? formatDistanceMeters(distanceMeters) : null,
    etaSeconds,
    etaLabel: etaSeconds !== null ? formatEtaSeconds(etaSeconds) : null,
    lastUpdatedSec,
    lastUpdatedLabel:
      lastUpdatedSec !== null ? formatLastUpdated(lastUpdatedSec) : null,
  };
}

/* ------------------------------------------------------------------ */
/* OSRM (public router) — pure URL + response shaping; the fetch       */
/* lives in the card component.                                        */
/* ------------------------------------------------------------------ */

export function buildOsrmRouteUrl(rider: LatLng, destination: LatLng): string {
  // OSRM wants lng,lat order.
  return (
    `https://router.project-osrm.org/route/v1/driving/` +
    `${rider.lng},${rider.lat};${destination.lng},${destination.lat}` +
    `?overview=full&geometries=geojson`
  );
}

export interface OsrmRoute {
  durationSec: number;
  /** Route polyline as lat/lng points; [] when geometry is unusable. */
  geometry: LatLng[];
}

/**
 * Parse an OSRM /route response. Returns null unless a route with a
 * usable duration exists — "NoRoute", an error body, or a malformed
 * payload must all hide the ETA rather than fall back to a guess.
 * Geometry is best-effort: a bad polyline never costs the duration.
 */
export function parseOsrmRoute(payload: unknown): OsrmRoute | null {
  if (!payload || typeof payload !== "object") return null;
  const body = payload as { code?: unknown; routes?: unknown };
  if (body.code !== "Ok" || !Array.isArray(body.routes)) return null;
  const route = body.routes[0] as
    | { duration?: unknown; geometry?: { coordinates?: unknown } }
    | undefined;
  if (!route || typeof route !== "object") return null;
  const duration = toFiniteNumber(route.duration);
  if (duration === null || duration < 0) return null;

  let geometry: LatLng[] = [];
  const coords = route.geometry?.coordinates;
  if (Array.isArray(coords) && coords.length >= 2) {
    const points: LatLng[] = [];
    let ok = true;
    for (const pair of coords) {
      if (!Array.isArray(pair)) {
        ok = false;
        break;
      }
      const lng = toFiniteNumber(pair[0]);
      const lat = toFiniteNumber(pair[1]);
      if (lat === null || lng === null || !isValidCoordinate(lat, lng)) {
        ok = false;
        break;
      }
      points.push({ lat, lng });
    }
    if (ok) geometry = points;
  }
  return { durationSec: duration, geometry };
}

/* ------------------------------------------------------------------ */
/* The 12-stage presentation timeline.                                 */
/* ------------------------------------------------------------------ */

export type PresentationStageState = "done" | "current" | "upcoming";

export interface PresentationStage {
  id: string;
  label: string;
  hint: string;
  state: PresentationStageState;
  /** ISO time of the real event behind the stage, when one exists. */
  at: string | null;
  /** Latest admin note for canonical stages (from status history). */
  note: string | null;
}

export interface PresentationInput {
  status: string;
  createdAt?: string | null;
  /** Canonical status → latest status-history event time (ISO). */
  statusTimes?: Partial<Record<string, string>>;
  /** Canonical status → latest status-history note. */
  statusNotes?: Partial<Record<string, string>>;
  /** Handover point id → completion time (ISO). */
  milestoneTimes?: Partial<Record<string, string>>;
  /** Completed handover point ids (the order's milestones). */
  completedPointIds?: readonly string[];
  /** True while a pickup assignment is active for this order. */
  pickupRiderActive?: boolean;
  /** When the pickup rider was assigned (ISO), if known. */
  pickupAssignedAt?: string | null;
}

const STAGE_DEFS: { id: string; label: string; hint: string }[] = [
  { id: "placed", label: "Order placed", hint: "We have received your order." },
  { id: "pickup_scheduled", label: "Pickup scheduled", hint: "Your pickup slot is booked." },
  { id: "rider_on_the_way", label: "Rider on the way", hint: "Our rider is heading to your door for the pickup." },
  { id: "picked_up", label: "Picked up", hint: "Your laundry is with our rider." },
  { id: "received", label: "Received at facility", hint: "Your items have been checked in at our facility." },
  { id: "washing", label: "Washing", hint: "Washed or dry cleaned with the method each fabric can take." },
  { id: "drying", label: "Drying", hint: "Dried as part of the same careful processing cycle." },
  { id: "ironing", label: "Ironing", hint: "Pressed, folded or hung — the finish each garment needs." },
  { id: "quality_check", label: "Quality check", hint: "Every piece is looked over once more before packing." },
  { id: "packed", label: "Packed", hint: "Clean, packed and ready to head back to you." },
  { id: "out_for_delivery", label: "Out for delivery", hint: "Your laundry is on its way back to you." },
  { id: "delivered", label: "Delivered", hint: "Handed over. Enjoy the freshness!" },
];

/**
 * Derive the 12 presentation stages from real signals only:
 *
 *   - Canonical position comes from stepIndex(status). Payment
 *     side-states (stepIndex -1) light nothing, exactly like the
 *     canonical timeline — the payment panel explains them.
 *   - "Rider on the way" lights ONLY while a pickup assignment is
 *     active (before pickup); once the order is PICKED_UP it is
 *     done, because the pickup provably happened.
 *   - Care stages key off the plant handover milestones recorded
 *     for this order (plant_processing / plant_finishing /
 *     plant_qc / plant_packing). With no milestones, IN_PROCESS
 *     alone lights "Washing" — cleaning is provably under way.
 *   - "Drying" shares the Processing handover with "Washing" (see
 *     the module header): it flips to done at that real event and
 *     is never the current stage on its own.
 */
export function presentationStages(
  input: PresentationInput,
): PresentationStage[] {
  const idx = stepIndex(input.status);
  const completed = new Set(input.completedPointIds ?? []);
  const st = input.statusTimes ?? {};
  const sn = input.statusNotes ?? {};
  const mt = input.milestoneTimes ?? {};
  const riderActive = Boolean(input.pickupRiderActive) && idx >= 0 && idx < 2;

  const inProcess = idx === 4;
  const pastProcess = idx >= 5;
  // Milestones count only once the lifecycle is actually in the
  // plant (defensive: a stray milestone row must not outrun the
  // order's status); past IN_PROCESS the whole care band is done.
  const careDone = (pointId: string): boolean =>
    pastProcess || (inProcess && completed.has(pointId));
  const processingDone = careDone("plant_processing");
  const finishingDone = careDone("plant_finishing");
  const qcDone = careDone("plant_qc");
  const packingDone = careDone("plant_packing");

  const state = (
    done: boolean,
    current: boolean,
  ): PresentationStageState =>
    done ? "done" : current ? "current" : "upcoming";

  const byId: Record<
    string,
    { state: PresentationStageState; at: string | null; note: string | null }
  > = {
    placed: {
      state: state(idx >= 1 || riderActive, idx === 0 && !riderActive),
      at: st.PLACED ?? input.createdAt ?? null,
      note: sn.PLACED ?? null,
    },
    pickup_scheduled: {
      state: state(idx >= 2 || riderActive, idx === 1 && !riderActive),
      at: st.PICKUP_SCHEDULED ?? null,
      note: sn.PICKUP_SCHEDULED ?? null,
    },
    rider_on_the_way: {
      state: state(idx >= 2, riderActive),
      at:
        mt.pickup ??
        (idx >= 2 ? (st.PICKED_UP ?? null) : (input.pickupAssignedAt ?? null)),
      note: null,
    },
    picked_up: {
      state: state(idx >= 3, idx === 2),
      at: st.PICKED_UP ?? null,
      note: sn.PICKED_UP ?? null,
    },
    received: {
      state: state(idx >= 4, idx === 3),
      at: st.RECEIVED ?? null,
      note: sn.RECEIVED ?? null,
    },
    washing: {
      state: state(processingDone, inProcess && !processingDone),
      at: mt.plant_processing ?? null,
      note: null,
    },
    drying: {
      // Shares the Processing boundary with washing — never current.
      state: state(processingDone, false),
      at: mt.plant_processing ?? null,
      note: null,
    },
    ironing: {
      state: state(
        finishingDone,
        inProcess && processingDone && !finishingDone,
      ),
      at: mt.plant_finishing ?? null,
      note: null,
    },
    quality_check: {
      state: state(qcDone, inProcess && finishingDone && !qcDone),
      at: mt.plant_qc ?? null,
      note: null,
    },
    packed: {
      state: state(packingDone, inProcess && qcDone && !packingDone),
      at: mt.plant_packing ?? null,
      note: null,
    },
    out_for_delivery: {
      state: state(idx >= 7, idx === 6),
      at: st.OUT_FOR_DELIVERY ?? null,
      note: sn.OUT_FOR_DELIVERY ?? null,
    },
    delivered: {
      state: state(false, idx === 7),
      at: st.DELIVERED ?? null,
      note: sn.DELIVERED ?? null,
    },
  };

  return STAGE_DEFS.map((def) => ({
    ...def,
    state: byId[def.id].state,
    at: byId[def.id].at,
    note: byId[def.id].note,
  }));
}
