import { NextResponse } from "next/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { resolveRequestAuth } from "@/lib/supabase/request-auth";
import { hasRole, isAdminTier, roleLabel, type UserRole } from "@/lib/roles";

/**
 * Admin gate (Phase 4) — SERVER ONLY.
 *
 * One place that decides whether the caller may use the admin panel /
 * admin APIs in LIVE mode:
 *   - "demo"           Supabase is not configured and demo mode is
 *                      legitimately active (src/lib/data-mode.ts).
 *                      Callers fall back to the clearly-badged demo mode.
 *   - "misconfigured"  Production build without Supabase env vars and
 *                      without the demo flag (P0 hardening): APIs
 *                      answer 503 NOT_CONFIGURED, pages render a
 *                      configuration-error screen — never demo data.
 *   - "unauthenticated" No signed-in user (API: 401; pages: redirect
 *                      to /login).
 *   - "forbidden"      Signed in, but profiles.role is below the
 *                      ops_manager tier (API: 403; pages: 403 screen).
 *   - "ok"             Signed-in admin-tier user. The role is re-read
 *                      from the profiles table on the server for
 *                      every call — it is never trusted from the
 *                      client — and travels with the result so routes
 *                      can apply the Delta 1 per-route minimums.
 *
 * Delta 1 (tiered roles, src/lib/roles.ts): the gate itself still
 * admits every admin tier (ops_manager and up), exactly as it
 * admitted 'admin' before; finer minimums are per-route via
 * roleGateError() below. RLS keeps up because schema_v7 teaches
 * public.is_admin() the same tiers — no policy changed.
 *
 * The caller may authenticate with the web cookie session OR a
 * validated Bearer access token (mobile app) — resolveRequestAuth
 * handles both; the gate's decisions are identical either way.
 */
export type AdminGate =
  | { kind: "demo" }
  | { kind: "misconfigured" }
  | { kind: "unauthenticated" }
  | { kind: "forbidden"; user: User }
  | { kind: "ok"; user: User; supabase: SupabaseClient; role: string };

export async function getAdminGate(): Promise<AdminGate> {
  // Dual auth (Mobile Phase 1): the caller's cookie session OR a
  // validated `Authorization: Bearer <access-token>` — see
  // src/lib/supabase/request-auth.ts. Web callers are unaffected.
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
  if (!profile || !isAdminTier(profile.role)) {
    return { kind: "forbidden", user };
  }
  return { kind: "ok", user, supabase, role: profile.role as string };
}

/**
 * Per-route role minimum (Delta 1). Call AFTER the route's normal
 * gate handling: when the caller passed the gate but sits below the
 * route's minimum tier, this returns the 403 FORBIDDEN_ROLE response
 * to send; otherwise null (proceed). Non-"ok" gates return null too —
 * the route's own gate handling has already answered for them.
 */
export function roleGateError(
  gate: AdminGate,
  min: UserRole,
): NextResponse | null {
  if (gate.kind !== "ok") return null;
  if (hasRole(gate.role, min)) return null;
  return NextResponse.json(
    {
      error: "FORBIDDEN_ROLE",
      message: `This action needs a ${roleLabel(min)} account or higher. Your account is ${roleLabel(gate.role)}.`,
    },
    { status: 403 },
  );
}
