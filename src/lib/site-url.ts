/**
 * Public site URL for links that leave the server (P0 password
 * reset) — SERVER ONLY.
 *
 * Source, in order:
 *   1. NEXT_PUBLIC_SITE_URL when set (the canonical deployment URL —
 *      set this in production so reset links never depend on the
 *      host header of whichever request happened to ask).
 *   2. The current request's origin, from x-forwarded-proto /
 *      x-forwarded-host (falling back to host), which is how Vercel
 *      presents the deployment URL.
 *
 * NOTE: this codebase had no site-url helper before P0 — the reset
 * flow is its first consumer, so it lives here from the start.
 */
export function getSiteUrl(request: Request): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");

  const proto = request.headers.get("x-forwarded-proto") ?? "http";
  const host =
    request.headers.get("x-forwarded-host") ??
    request.headers.get("host") ??
    "localhost:3000";
  return `${proto}://${host}`;
}
