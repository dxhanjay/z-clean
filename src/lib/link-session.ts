/**
 * Link-session resolution for the two emailed-link landing pages:
 * `/staff/set-password` (staff invites) and `/reset-password`
 * (password resets).
 *
 * Why this module exists — the invite bug of 2026-11-05:
 *
 * Supabase email links are verified by GoTrue, which redirects back
 * to the app with IMPLICIT-flow tokens in the URL fragment
 * (`#access_token=…&refresh_token=…&type=invite`). That is how links
 * sent by the service-role admin client always arrive
 * (`inviteUserByEmail`, and `resetPasswordForEmail` from the admin
 * client in the staff-invite endpoint).
 *
 * The app's browser client, however, comes from @supabase/ssr —
 * whose createBrowserClient hardcodes `flowType: "pkce"`
 * (@supabase/ssr/dist/main/createBrowserClient.js:
 * `flowType: "pkce"`). A PKCE client refuses implicit callbacks
 * outright: auth-js `_getSessionFromURL` switches on the callback
 * type and throws `AuthPKCEGrantCodeExchangeError('Not a valid
 * PKCE flow url.')` for `case 'implicit'` when
 * `this.flowType === 'pkce'`. So the session in the fragment is
 * never stored, `getSession()` returns null and
 * `onAuthStateChange` never fires with a session — while the
 * one-time verify token has ALREADY been consumed server-side, so
 * reopening the same email link just yields `otp_expired`. The old
 * pages only waited on getSession()/onAuthStateChange with a 3 s
 * timer and then declared the (perfectly good, now spent) link
 * "not valid".
 *
 * The fix: the pages read the fragment themselves and hand the
 * tokens to `auth.setSession()`, which accepts them regardless of
 * flowType. This module is the pure decision logic for that —
 * shared by both pages, unit-tested in
 * `scripts/test-link-session.mjs`. It has no imports on purpose.
 */

export interface LinkHashTokens {
  accessToken: string;
  refreshToken: string;
}

export type LinkSessionAction =
  /** A session already exists — show the password form. */
  | { kind: "ready" }
  /** The fragment carries implicit-flow tokens — call setSession. */
  | { kind: "set-session"; accessToken: string; refreshToken: string }
  /** The link failed or carries nothing usable — invalid state. */
  | { kind: "invalid"; reason: "error" | "no-session" };

export interface ParsedLinkHash {
  tokens: LinkHashTokens | null;
  /** True when the fragment is an auth error redirect. */
  hasError: boolean;
}

/**
 * Parse a URL fragment (`window.location.hash`, leading `#`
 * optional) into implicit-flow tokens and/or an error flag.
 * Supabase error redirects carry `error=…` and/or
 * `error_code=otp_expired` in the same fragment.
 */
export function parseLinkHash(hash: string): ParsedLinkHash {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!raw) return { tokens: null, hasError: false };
  const params = new URLSearchParams(raw);
  const hasError = Boolean(
    params.get("error") || params.get("error_code"),
  );
  const accessToken = params.get("access_token") ?? "";
  const refreshToken = params.get("refresh_token") ?? "";
  return {
    tokens:
      accessToken && refreshToken
        ? { accessToken, refreshToken }
        : null,
    hasError,
  };
}

/**
 * Decide what an emailed-link landing page should do, given whether
 * the Supabase client already holds a session and the raw URL
 * fragment.
 *
 * Precedence:
 *   1. Error fragment → invalid, directly — even over an existing
 *      session. The link itself failed; a stale cookie session
 *      belongs to whoever was signed in before, and silently
 *      turning this visit into a password change for THAT account
 *      would be wrong.
 *   2. Existing session → form (covers the PKCE `?code=` exchange
 *      the browser client performs itself, and persisted sessions).
 *   3. Fragment tokens → setSession with them.
 *   4. Nothing usable → invalid.
 */
export function resolveLinkSession(input: {
  hasSession: boolean;
  hash: string;
}): LinkSessionAction {
  const { tokens, hasError } = parseLinkHash(input.hash);
  if (hasError) return { kind: "invalid", reason: "error" };
  if (input.hasSession) return { kind: "ready" };
  if (tokens) {
    return {
      kind: "set-session",
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    };
  }
  return { kind: "invalid", reason: "no-session" };
}
