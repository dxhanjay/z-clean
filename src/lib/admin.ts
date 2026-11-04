import type { SupabaseClient, User } from "@supabase/supabase-js";
import { resolveRequestAuth } from "@/lib/supabase/request-auth";

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
 *   - "forbidden"      Signed in, but profiles.role is not 'admin'
 *                      (API: 403; pages: 403 screen).
 *   - "ok"             Signed-in admin. The role is re-read from the
 *                      profiles table on the server for every call —
 *                      it is never trusted from the client.
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
  | { kind: "ok"; user: User; supabase: SupabaseClient };

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
  if (!profile || profile.role !== "admin") {
    return { kind: "forbidden", user };
  }
  return { kind: "ok", user, supabase };
}
