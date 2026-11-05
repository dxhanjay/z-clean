/**
 * Live rider tracking (Staff Web App phase — spec: STAFF_APP_SPEC.md).
 *
 * The pure rules behind the tracking pipeline, deliberately
 * dependency-light (only the handover chain + staff-role matrix, both
 * pure) so the plain-node suite (scripts/test-tracking.mjs) can
 * compile this module alone:
 *
 *   - WHO may stream a position: only the employee an ACTIVE order
 *     assignment belongs to (`canPingAssignment`). Authorization is
 *     assignment-based — never role-based — so a `staff` profile can
 *     never ping for an order that is not theirs, and completing the
 *     assignment (the handover) closes the gate instantly.
 *   - WHO may be assigned to a leg (`canAssignEmployee`): an active
 *     employee holding the leg's receiving role from the Phase 8
 *     handover chain (pickup → Picker; delivery → Home Delivery Staff
 *     or Outbound Transporter). One source of truth — the chain.
 *   - Coordinate sanity (`isValidCoordinate`), great-circle maths
 *     (`haversineMeters`) and a conservative ETA estimate for the
 *     customer map (Phase D consumes these).
 *   - Nominatim geocode query/response shaping (`buildGeocodeQuery`,
 *     `parseGeocodeResponse`) — parsing is pure; the HTTP call lives
 *     in src/lib/tracking-server.ts.
 *   - The client-side send throttle (`shouldSendPing`): the staff web
 *     app sends a fix at most every 15 s and only after moving 25 m —
 *     the rule lives here so it is tested, not re-invented in the UI.
 */

import { handoverPoint, receivingRoles } from "./handovers";

/* ------------------------------------------------------------------ */
/* Legs                                                                */
/* ------------------------------------------------------------------ */

export const TRACKING_LEGS = ["pickup", "delivery"] as const;
export type TrackingLeg = (typeof TRACKING_LEGS)[number];

export function isTrackingLeg(value: unknown): value is TrackingLeg {
  return value === "pickup" || value === "delivery";
}

/**
 * The handover point that completes a leg: the pickup leg ends when
 * the customer→picker OTP handover ("pickup") completes; the delivery
 * leg ends at the rider→customer OTP handover ("delivery"). Both are
 * OTP points in the chain — the staff app only ever completes these
 * two; every plant-internal point stays in the admin console.
 */
export function legHandoverPointId(leg: TrackingLeg): "pickup" | "delivery" {
  return leg;
}

/** Inverse of legHandoverPointId; null for plant-internal points. */
export function legForHandoverPointId(pointId: string): TrackingLeg | null {
  return isTrackingLeg(pointId) ? pointId : null;
}

/** Staff roles that may be assigned to (and receive) a leg. */
export function legReceivingRoles(leg: TrackingLeg): string[] {
  const point = handoverPoint(legHandoverPointId(leg));
  return point ? receivingRoles(point) : [];
}

/* ------------------------------------------------------------------ */
/* Assignments                                                         */
/* ------------------------------------------------------------------ */

export interface AssignmentRef {
  id: string;
  orderId: string;
  leg: string;
  employeeId: string;
  completedAt: string | null;
}

/** An assignment is active until its handover completes it. */
export function isAssignmentActive(
  assignment: Pick<AssignmentRef, "completedAt"> | null | undefined,
): boolean {
  return Boolean(assignment) && assignment!.completedAt === null;
}

export type AssignVerdict =
  | { ok: true }
  | {
      ok: false;
      code: "EMPLOYEE_INACTIVE" | "ROLE_MISMATCH" | "INVALID_LEG";
      message: string;
    };

/**
 * May this employee be assigned to this leg? Mirrors the handover
 * chain's receiving-role rule (the same check `employeeCanReceive`
 * will apply again at handover time — assignment is the early gate,
 * the handover is the final one).
 */
export function canAssignEmployee(input: {
  leg: string;
  employmentStatus: string;
  roles: readonly string[];
}): AssignVerdict {
  if (!isTrackingLeg(input.leg)) {
    return {
      ok: false,
      code: "INVALID_LEG",
      message: "Leg must be \"pickup\" or \"delivery\".",
    };
  }
  if (input.employmentStatus !== "active") {
    return {
      ok: false,
      code: "EMPLOYEE_INACTIVE",
      message: "Only an active employee can be assigned a leg.",
    };
  }
  const allowed = legReceivingRoles(input.leg);
  if (!input.roles.some((r) => allowed.includes(r))) {
    return {
      ok: false,
      code: "ROLE_MISMATCH",
      message:
        input.leg === "pickup"
          ? "Pickup legs need an employee with the Picker role."
          : "Delivery legs need an employee with the Home Delivery Staff or Outbound Transporter role.",
    };
  }
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* Ping authorization — THE security rule of the tracking stream.      */
/* ------------------------------------------------------------------ */

export type PingVerdict =
  | { ok: true }
  | {
      ok: false;
      code:
        | "ASSIGNMENT_NOT_FOUND"
        | "NO_EMPLOYEE_LINK"
        | "NOT_YOUR_ASSIGNMENT"
        | "ASSIGNMENT_COMPLETED";
      message: string;
    };

/**
 * Decide whether a signed-in user may stream a position for an
 * assignment. The caller is identified by the EMPLOYEE RECORD linked
 * to their account (employees.user_id) — an admin tier confers NO
 * ping rights: if the assignment is not yours, you cannot move its
 * marker. `employeeIdForUser` is null when the account has no linked
 * employee record.
 */
export function canPingAssignment(input: {
  assignment: AssignmentRef | null;
  employeeIdForUser: string | null;
}): PingVerdict {
  if (!input.assignment) {
    return {
      ok: false,
      code: "ASSIGNMENT_NOT_FOUND",
      message: "That assignment does not exist.",
    };
  }
  if (!input.employeeIdForUser) {
    return {
      ok: false,
      code: "NO_EMPLOYEE_LINK",
      message: "Your account is not linked to an employee record.",
    };
  }
  if (input.assignment.employeeId !== input.employeeIdForUser) {
    return {
      ok: false,
      code: "NOT_YOUR_ASSIGNMENT",
      message: "This assignment belongs to another rider.",
    };
  }
  if (!isAssignmentActive(input.assignment)) {
    return {
      ok: false,
      code: "ASSIGNMENT_COMPLETED",
      message: "This assignment is complete — location sharing has ended.",
    };
  }
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* Coordinates                                                         */
/* ------------------------------------------------------------------ */

export interface LatLng {
  lat: number;
  lng: number;
}

/** WGS84 sanity: finite numbers inside the legal ranges. */
export function isValidCoordinate(lat: unknown, lng: unknown): boolean {
  return (
    typeof lat === "number" &&
    typeof lng === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

/** GPS accuracy in metres: optional, but when present must be sane. */
export function isValidAccuracy(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 100_000
  );
}

const EARTH_RADIUS_M = 6_371_000;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Great-circle distance between two points, in metres. */
export function haversineMeters(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h =
    sinLat * sinLat +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinLng * sinLng;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * A deliberately conservative ETA: straight-line distance padded by
 * a road factor (roads are never the crow's flight) at an assumed
 * urban riding speed. Phase D labels this an estimate in the UI.
 * Assumes 20 km/h by default (dense city traffic).
 */
export function estimateEtaSeconds(
  distanceMeters: number,
  opts?: { roadFactor?: number; speedKmh?: number },
): number {
  if (!Number.isFinite(distanceMeters) || distanceMeters <= 0) return 0;
  const roadFactor = opts?.roadFactor ?? 1.35;
  const speedKmh = opts?.speedKmh ?? 20;
  const roadMeters = distanceMeters * roadFactor;
  const metersPerSecond = (speedKmh * 1000) / 3600;
  return Math.round(roadMeters / metersPerSecond);
}

/* ------------------------------------------------------------------ */
/* Client send throttle (staff web app)                                */
/* ------------------------------------------------------------------ */

export const PING_MIN_INTERVAL_MS = 15_000;
export const PING_MIN_DISTANCE_M = 25;

export interface PingSample extends LatLng {
  atMs: number;
}

/**
 * Should the staff app send this fix? The first fix always sends;
 * afterwards a fix sends when BOTH the minimum interval has passed
 * AND the rider has moved at least the minimum distance — plus a
 * slow heartbeat (every 2 minutes) so a waiting rider's "last
 * updated" stays honest instead of going stale.
 */
export function shouldSendPing(
  lastSent: PingSample | null,
  next: PingSample,
): boolean {
  if (!lastSent) return true;
  const elapsed = next.atMs - lastSent.atMs;
  if (elapsed >= 120_000) return true; // heartbeat
  if (elapsed < PING_MIN_INTERVAL_MS) return false;
  return haversineMeters(lastSent, next) >= PING_MIN_DISTANCE_M;
}

/* ------------------------------------------------------------------ */
/* Geocoding (Nominatim) — pure shaping; HTTP lives server-side.       */
/* ------------------------------------------------------------------ */

export interface AddressParts {
  line: string;
  area?: string | null;
  city: string;
  pincode: string;
}

/** The Nominatim `q` string for an address row. */
export function buildGeocodeQuery(address: AddressParts): string {
  const parts = [address.line, address.area, address.city, address.pincode, "India"]
    .map((p) => (typeof p === "string" ? p.trim() : ""))
    .filter(Boolean);
  return parts.join(", ");
}

/**
 * Parse a Nominatim search response (JSON array; best match first).
 * Returns null for anything unusable — empty results, malformed rows,
 * out-of-range coordinates — so a failed geocode simply leaves the
 * address without a pin.
 */
export function parseGeocodeResponse(payload: unknown): LatLng | null {
  if (!Array.isArray(payload) || payload.length === 0) return null;
  const first = payload[0] as { lat?: unknown; lon?: unknown } | null;
  if (!first || typeof first !== "object") return null;
  const lat = typeof first.lat === "string" ? Number(first.lat) : first.lat;
  const lng = typeof first.lon === "string" ? Number(first.lon) : first.lon;
  if (!isValidCoordinate(lat, lng)) return null;
  return { lat: lat as number, lng: lng as number };
}
