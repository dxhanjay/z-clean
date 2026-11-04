/**
 * Data mode (P0 hardening) — the ONE place that decides whether the
 * app talks to the live database, runs the clearly-badged browser DEMO
 * store, or refuses loudly because it is misconfigured.
 *
 * Rules:
 *   - Supabase env vars present                          → "live"
 *   - Env vars missing + NEXT_PUBLIC_DEMO_MODE === "true" → "demo"
 *     (explicit opt-in, any environment)
 *   - Env vars missing + NODE_ENV !== "production"        → "demo"
 *     (local development ergonomics: a fresh checkout still demos)
 *   - Env vars missing in a production build              → "misconfigured"
 *     FAIL-CLOSED: the data layer surfaces a configuration error
 *     (admin error screen / API 503 { error: "NOT_CONFIGURED" })
 *     instead of silently presenting demo data as if it were real.
 *
 * Safe to import from client and server code: it reads only
 * NEXT_PUBLIC_* variables (inlined by Next at build time) and
 * NODE_ENV. The server-side authority is the same function — route
 * handlers and the admin gate consult getDataMode() rather than
 * re-deriving "configured?" ad hoc.
 */
export type DataMode = "live" | "demo" | "misconfigured";

/** True when the public Supabase env vars are present. */
export function isSupabaseEnvPresent(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

export function getDataMode(): DataMode {
  if (isSupabaseEnvPresent()) return "live";
  if (process.env.NEXT_PUBLIC_DEMO_MODE === "true") return "demo";
  if (process.env.NODE_ENV !== "production") return "demo";
  return "misconfigured";
}

/** True only when demo mode is legitimately active (see header). */
export function isDemoMode(): boolean {
  return getDataMode() === "demo";
}

/** True when a production deployment is missing its configuration. */
export function isMisconfigured(): boolean {
  return getDataMode() === "misconfigured";
}
