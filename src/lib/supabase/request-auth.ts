import {
  createClient as createJsClient,
  type SupabaseClient,
  type User,
} from "@supabase/supabase-js";
import { headers } from "next/headers";
import { createClient } from "./server";
import { getDataMode } from "@/lib/data-mode";

/**
 * Request auth resolution (Mobile Phase 1) — SERVER ONLY.
 *
 * The API now accepts TWO credential forms, so the web app and the
 * Expo mobile app share one backend:
 *
 *   1. Cookie session (the web app) — resolved exactly as before via
 *      the @supabase/ssr cookie client. Tried FIRST, so web behaviour
 *      is byte-for-byte unchanged.
 *   2. `Authorization: Bearer <supabase-access-token>` (the mobile
 *      app, which has no cookie jar) — the token is validated against
 *      the Supabase Auth server with `auth.getUser(token)` (never
 *      trusted by merely decoding the JWT), and the queries then run
 *      through a client that carries the token as its Authorization
 *      header, so Postgres RLS applies as that user — the same
 *      protection the cookie client gets.
 *
 * Returns a discriminated result so callers keep their existing
 * demo / 401 / 403 behaviour:
 *   - "unconfigured" — Supabase env vars are absent AND demo mode is
 *                      legitimately active (see src/lib/data-mode.ts).
 *   - "misconfigured" — env vars absent in a production build without
 *                      the demo flag (P0 hardening, fail-closed):
 *                      callers must answer 503 NOT_CONFIGURED, never
 *                      demo data.
 *   - "anonymous"    — configured, but no valid cookie or bearer user.
 *   - "user"         — a verified user + the client to query with.
 */
export type RequestAuth =
  | { kind: "unconfigured" }
  | { kind: "misconfigured" }
  | { kind: "anonymous"; supabase: SupabaseClient }
  | { kind: "user"; supabase: SupabaseClient; user: User };

/**
 * An anon-key client whose PostgREST/Auth calls carry the user's
 * access token. No session is persisted or refreshed server-side —
 * the token is presented per request, exactly like a cookie.
 */
export function createBearerClient(accessToken: string): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return null;
  }
  return createJsClient(url, anonKey, {
    global: {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

export async function resolveRequestAuth(): Promise<RequestAuth> {
  const cookieClient = await createClient();
  if (!cookieClient) {
    // Env vars absent: demo only when data-mode says demo is
    // legitimate; a misconfigured production build fails closed.
    return getDataMode() === "demo"
      ? { kind: "unconfigured" }
      : { kind: "misconfigured" };
  }

  // 1 · Cookie session first — the web path, unchanged.
  const {
    data: { user },
  } = await cookieClient.auth.getUser();
  if (user) return { kind: "user", supabase: cookieClient, user };

  // 2 · Bearer access token — the mobile app path.
  const headerStore = await headers();
  const authorization = headerStore.get("authorization");
  if (authorization && /^Bearer\s+/i.test(authorization)) {
    const token = authorization.replace(/^Bearer\s+/i, "").trim();
    if (token) {
      const bearerClient = createBearerClient(token);
      if (bearerClient) {
        const {
          data: { user: bearerUser },
          error,
        } = await bearerClient.auth.getUser(token);
        if (!error && bearerUser) {
          return { kind: "user", supabase: bearerClient, user: bearerUser };
        }
      }
    }
  }

  return { kind: "anonymous", supabase: cookieClient };
}
