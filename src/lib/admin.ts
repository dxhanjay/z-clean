import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/**
 * Admin gate (Phase 4) — SERVER ONLY.
 *
 * One place that decides whether the caller may use the admin panel /
 * admin APIs in LIVE mode:
 *   - "demo"           Supabase is not configured at all. Callers fall
 *                      back to the clearly-badged demo mode.
 *   - "unauthenticated" No signed-in user (API: 401; pages: redirect
 *                      to /login).
 *   - "forbidden"      Signed in, but profiles.role is not 'admin'
 *                      (API: 403; pages: 403 screen).
 *   - "ok"             Signed-in admin. The role is re-read from the
 *                      profiles table on the server for every call —
 *                      it is never trusted from the client.
 */
export type AdminGate =
  | { kind: "demo" }
  | { kind: "unauthenticated" }
  | { kind: "forbidden"; user: User }
  | { kind: "ok"; user: User; supabase: SupabaseClient };

export async function getAdminGate(): Promise<AdminGate> {
  const supabase = await createClient();
  if (!supabase) return { kind: "demo" };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { kind: "unauthenticated" };

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
