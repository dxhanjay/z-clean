import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { passwordResetRequestSchema } from "@/lib/validation";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { getSiteUrl } from "@/lib/site-url";

/**
 * POST /api/auth/reset — request a password-reset email (P0).
 *
 * The response is ALWAYS 200 { ok: true } — for unknown emails,
 * malformed bodies, exhausted limits and unconfigured deployments
 * alike. Anything else would let a caller enumerate which emails
 * have accounts. When a limit is hit the email is silently NOT sent;
 * the response does not change.
 *
 * Limits (fixed hourly windows, src/lib/rate-limit.ts):
 *   - per client IP: 5/hour   - per email address: 3/hour
 *
 * The reset link lands on /reset-password (redirectTo), where the
 * browser client picks up the recovery session and the user sets a
 * new password.
 */
export async function POST(request: Request) {
  const ok = () => NextResponse.json({ ok: true });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return ok();
  }

  const parsed = passwordResetRequestSchema.safeParse(body);
  if (!parsed.success) return ok();
  const email = parsed.data.email;

  const [ipAllowed, emailAllowed] = await Promise.all([
    checkRateLimit(`auth-reset:ip:${getClientIp(request)}`, 5, 3600),
    checkRateLimit(`auth-reset:email:${email}`, 3, 3600),
  ]);
  if (!ipAllowed || !emailAllowed) return ok();

  const supabase = await createClient();
  if (!supabase) return ok(); // demo / unconfigured: nothing to send with

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${getSiteUrl(request)}/reset-password`,
  });
  if (error) {
    // Never surfaced to the caller (see header) — logged for support.
    console.error(`[auth/reset] send failed for ${email}: ${error.message}`);
  }
  return ok();
}
