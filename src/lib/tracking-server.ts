import type { SupabaseClient, User } from "@supabase/supabase-js";
import { after } from "next/server";
import { resolveRequestAuth } from "./supabase/request-auth";
import { createAdminClient } from "./supabase/admin";
import { isAdminTier } from "./roles";
import {
  parseGeocodeResponse,
  resolveGeocodeLadder,
  type AddressParts,
  type GeocodeHit,
  type LatLng,
} from "./tracking";

/**
 * Staff gate + geocoding (Staff Web App phase) — SERVER ONLY.
 *
 * THE STAFF GATE is a different shape from the admin gate on purpose:
 *
 *   - A `staff` profile NEVER passes the admin gate (schema_v10 does
 *     not teach is_admin() the new enum value, and roles.ts keeps the
 *     tier at level 0). Everything a staff account may do flows from
 *     the EMPLOYEE RECORD linked to it (employees.user_id) plus the
 *     order ASSIGNMENTS that record carries — see the pure predicates
 *     in src/lib/tracking.ts.
 *   - Employee records and assignments sit behind admin-only RLS, so
 *     after the caller's identity is proven (cookie or Bearer, via
 *     resolveRequestAuth), the LINK LOOKUP and all staff reads/writes
 *     run through the service-role client, always scoped to the
 *     verified employee id. Authorization is decided HERE, in code,
 *     before any privileged query runs — the same pattern the push
 *     registration route uses for cross-account token reassignment.
 *   - Admin tiers also pass this gate (support viewing): they get
 *     kind "admin" with their linked employee when they have one.
 *     Action endpoints (ping, staff handover) still demand the
 *     assignment be the CALLER's own, whoever the caller is.
 */

export interface StaffEmployee {
  id: string;
  fullName: string;
  employmentStatus: string;
  roles: string[];
  branchId: string | null;
}

export type StaffGate =
  | { kind: "demo" }
  | { kind: "misconfigured" }
  | { kind: "unauthenticated" }
  | { kind: "forbidden"; user: User }
  | {
      kind: "staff";
      user: User;
      supabase: SupabaseClient;
      admin: SupabaseClient;
      role: string;
      employee: StaffEmployee;
    }
  | {
      kind: "admin";
      user: User;
      supabase: SupabaseClient;
      admin: SupabaseClient;
      role: string;
      employee: StaffEmployee | null;
    };

/** Load the employee record linked to an auth user, via service role. */
export async function loadLinkedEmployee(
  admin: SupabaseClient,
  userId: string,
): Promise<StaffEmployee | null> {
  const { data: row } = await admin
    .from("employees")
    .select("id, full_name, employment_status, branch_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (!row) return null;
  const { data: roleRows } = await admin
    .from("employee_roles")
    .select("role")
    .eq("employee_id", row.id);
  return {
    id: row.id as string,
    fullName: row.full_name as string,
    employmentStatus: row.employment_status as string,
    roles: (roleRows ?? []).map((r) => r.role as string),
    branchId: (row.branch_id as string | null) ?? null,
  };
}

export async function getStaffGate(): Promise<StaffGate> {
  const auth = await resolveRequestAuth();
  if (auth.kind === "unconfigured") return { kind: "demo" };
  if (auth.kind === "misconfigured") return { kind: "misconfigured" };
  if (auth.kind !== "user") return { kind: "unauthenticated" };

  const { supabase, user } = auth;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  const role = (profile?.role as string | undefined) ?? "customer";

  const admin = createAdminClient();
  if (!admin) return { kind: "misconfigured" };

  if (isAdminTier(role)) {
    const employee = await loadLinkedEmployee(admin, user.id);
    return { kind: "admin", user, supabase, admin, role, employee };
  }

  if (role === "staff") {
    const employee = await loadLinkedEmployee(admin, user.id);
    if (employee) {
      return { kind: "staff", user, supabase, admin, role, employee };
    }
  }

  return { kind: "forbidden", user };
}

/* ------------------------------------------------------------------ */
/* Geocoding — Nominatim, via the fallback ladder.                     */
/*                                                                     */
/* One ladder walk per address, ever: the result is cached on the     */
/* address row, so the sequential requests in a walk (typically       */
/* three for Bokaro — full-address miss, area miss, pincode hit)      */
/* happen once per address, with an identifying User-Agent per the    */
/* Nominatim usage policy. A failure at every rung — no match,        */
/* timeout, bad payload — leaves lat/lng null: the order is never     */
/* blocked and no pin is ever guessed. The write uses the             */
/* service-role client because it must also work for the order        */
/* flow's freshly inserted address rows.                              */
/*                                                                     */
/* The matched PRECISION is logged on every hit (`[geocode] … at      */
/* pincode precision`) and returned to callers: a pincode hit is a    */
/* postcode centroid — the customer's AREA, not their doorstep —      */
/* and anything derived from it (map pin, distance, ETA) is an        */
/* area estimate. The pure ladder lives in src/lib/tracking.ts.       */
/* ------------------------------------------------------------------ */

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const GEOCODER_USER_AGENT =
  "Sri Clean/1.0 (laundry order tracking; Bokaro Steel City, India)";
const GEOCODER_TIMEOUT_MS = 8000;

/** One Nominatim request. Null for ANY failure — never throws. */
async function fetchNominatim(
  query: string,
  timeoutMs: number,
): Promise<LatLng | null> {
  try {
    const url =
      `${NOMINATIM_URL}?format=jsonv2&limit=1` +
      `&q=${encodeURIComponent(query)}`;
    const response = await fetch(url, {
      headers: {
        "User-Agent": GEOCODER_USER_AGENT,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) {
      console.error(`[geocode] Nominatim answered ${response.status} for "${query}"`);
      return null;
    }
    return parseGeocodeResponse(await response.json());
  } catch (err) {
    console.error(`[geocode] Nominatim request failed for "${query}":`, err);
    return null;
  }
}

/**
 * Resolve an address and cache the winning coordinates on its row.
 * Returns the hit (coords + precision) or null when every ladder
 * rung missed. Never throws. `timeoutMs` bounds EACH Nominatim
 * request: the background path uses the default; latency-sensitive
 * callers (the tracking feed's backfill-on-read) pass a shorter one.
 */
export async function geocodeAddress(
  addressId: string,
  parts: AddressParts,
  options?: { timeoutMs?: number },
): Promise<GeocodeHit | null> {
  try {
    const admin = createAdminClient();
    if (!admin) return null;

    const timeoutMs = options?.timeoutMs ?? GEOCODER_TIMEOUT_MS;
    const hit = await resolveGeocodeLadder(parts, (query) =>
      fetchNominatim(query, timeoutMs),
    );
    if (!hit) return null;

    console.log(
      `[geocode] address ${addressId} resolved at ${hit.precision} precision ` +
        `(${hit.lat}, ${hit.lng}) via "${hit.query}"`,
    );

    const { error } = await admin
      .from("addresses")
      .update({ lat: hit.lat, lng: hit.lng })
      .eq("id", addressId);
    if (error) {
      console.error(
        `[geocode] could not store coordinates for address ${addressId}: ${error.message}`,
      );
    }
    return hit;
  } catch (err) {
    console.error(`[geocode] failed for address ${addressId}:`, err);
    return null;
  }
}

/**
 * Background wrapper for request handlers: the geocode runs via
 * Next's `after()`, so the order/address response returns
 * immediately (its latency is unchanged) while the platform keeps
 * the invocation alive until the ladder walk finishes. A bare
 * un-awaited promise would NOT be safe here: on Vercel the
 * invocation can freeze as soon as the response is sent, killing
 * the walk mid-flight. `geocodeAddress` swallows its own errors.
 */
export function scheduleGeocode(addressId: string, parts: AddressParts): void {
  after(async () => {
    await geocodeAddress(addressId, parts);
  });
}
