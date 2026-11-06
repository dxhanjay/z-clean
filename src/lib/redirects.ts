/**
 * Post-login redirect rule (pure, import-free — unit-tested by
 * scripts/test-redirects.mjs).
 *
 * The login page accepts a ?next= target: the staff shell sends
 * unauthenticated riders to /login?next=/staff, and without this
 * rule they landed on the customer dashboard after signing in and
 * had to navigate back. The target is honoured ONLY when it is a
 * safe LOCAL path:
 *   - it must start with "/" (a path on this site),
 *   - it must NOT start with "//" — a protocol-relative URL the
 *     browser resolves against another host,
 *   - it must not contain a backslash — some browsers normalise
 *     "/\host" into "//host" after the fact.
 * Anything else (missing, empty, absolute URL, bare word) falls
 * back to the caller's default, so a crafted sign-in link can
 * never bounce a freshly authenticated user off-site.
 */
export function safeNextPath(
  raw: string | null | undefined,
  fallback: string,
): string {
  if (!raw) return fallback;
  const value = raw.trim();
  if (!value.startsWith("/")) return fallback;
  if (value.startsWith("//")) return fallback;
  if (value.includes("\\")) return fallback;
  return value;
}
