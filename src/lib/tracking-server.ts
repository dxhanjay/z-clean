import type { SupabaseClient, User } from "@supabase/supabase-js";
import { resolveRequestAuth } from "./supabase/request-auth";
import { createAdminClient } from "./supabase/admin";
import { isAdminTier } from "./roles";
import {
  buildGeocodeQuery,
  parseGeocodeResponse,
  type AddressParts,
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
/* Geocoding — Nominatim, fire-and-forget.                             */
/*                                                                     */
/* One server-side call per new address (the spec's courtesy rule),    */
/* with an identifying User-Agent per the Nominatim usage policy. A    */
/* failure — no match, timeout, bad payload — leaves lat/lng null:     */
/* the order is never blocked and no pin is ever guessed. The write    */
/* uses the service-role client because it must also work for the      */
/* order flow's freshly inserted address rows.                         */
/* ------------------------------------------------------------------ */

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const GEOCODER_USER_AGENT =
  "Z-clean/1.0 (laundry order tracking; Bokaro Steel City, India)";

export async function geocodeAddress(
  addressId: string,
  parts: AddressParts,
): Promise<void> {
  try {
    const admin = createAdminClient();
    if (!admin) return;

    const query = buildGeocodeQuery(parts);
    const url =
      `${NOMINATIM_URL}?format=jsonv2&limit=1` +
      `&q=${encodeURIComponent(query)}`;

    const response = await fetch(url, {
      headers: {
        "User-Agent": GEOCODER_USER_AGENT,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) {
      console.error(
        `[geocode] Nominatim answered ${response.status} for address ${addressId}`,
      );
      return;
    }
    const coords = parseGeocodeResponse(await response.json());
    if (!coords) return;

    const { error } = await admin
      .from("addresses")
      .update({ lat: coords.lat, lng: coords.lng })
      .eq("id", addressId);
    if (error) {
      console.error(
        `[geocode] could not store coordinates for address ${addressId}: ${error.message}`,
      );
    }
  } catch (err) {
    console.error(`[geocode] failed for address ${addressId}:`, err);
  }
}

/**
 * Fire-and-forget wrapper for request handlers: kick the geocode off
 * and return immediately — the order/address response never waits on
 * the geocoder. `geocodeAddress` swallows its own errors.
 */
export function scheduleGeocode(addressId: string, parts: AddressParts): void {
  void geocodeAddress(addressId, parts);
}
