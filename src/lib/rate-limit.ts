/**
 * Rate limiting (P0 hardening) — SERVER ONLY (except the pure helpers).
 *
 * Fixed-window counters stored in Postgres (`rate_limits`, see
 * supabase/schema_v6.sql). The counting itself is ONE atomic statement
 * via the rate_limit_hit() SQL function, called with the service-role
 * client, so concurrent requests can never both slip under the limit.
 *
 * FAIL-OPEN BY DESIGN: if the counter store is unreachable (no
 * service-role client, migration not applied yet, RPC error), the
 * request is ALLOWED and the failure is logged. Rate limiting is an
 * abuse brake, not a correctness mechanism — it must never take the
 * shop down with it. The pure helpers (windowStart / isAllowed /
 * getClientIp) carry the actual policy maths and are unit-tested in
 * scripts/test-ratelimit.mjs.
 */

/** Start (ms epoch) of the fixed window containing `ts`. */
export function windowStart(ts: number, windowSec: number): number {
  const windowMs = windowSec * 1000;
  return Math.floor(ts / windowMs) * windowMs;
}

/**
 * Whether a request is allowed given the bucket's NEW count (the
 * current request included, as returned by rate_limit_hit). The
 * `limit`-th request in a window is allowed; the next one is not.
 */
export function isAllowed(count: number, limit: number): boolean {
  return count <= limit;
}

/**
 * Best-effort client IP: the first entry of x-forwarded-for (the
 * original client as seen by the platform proxy), else "unknown" —
 * all unidentified callers share one bucket rather than none.
 */
export function getClientIp(request: Pick<Request, "headers">): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return "unknown";
}

/**
 * Record one hit for `key` in the current fixed window and report
 * whether it is within `limit`. Fails open (see header): any error
 * logs and returns true.
 */
export async function checkRateLimit(
  key: string,
  limit: number,
  windowSec: number,
): Promise<boolean> {
  try {
    // Dynamic import so the pure helpers stay loadable (and unit
    // testable) without the service-role client graph.
    const { createAdminClient } = await import("./supabase/admin");
    const admin = createAdminClient();
    if (!admin) return true; // not configured — nothing to count with

    const startIso = new Date(windowStart(Date.now(), windowSec)).toISOString();
    const { data, error } = await admin.rpc("rate_limit_hit", {
      p_key: key,
      p_window_start: startIso,
    });
    if (error) {
      console.error(`[rate-limit] hit failed for "${key}": ${error.message}`);
      return true;
    }
    if (typeof data !== "number") return true;
    return isAllowed(data, limit);
  } catch (err) {
    console.error(`[rate-limit] check failed for "${key}":`, err);
    return true;
  }
}
