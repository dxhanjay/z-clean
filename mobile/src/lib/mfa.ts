import { supabase } from "./supabase";

/**
 * MFA step-up check (P0) — mirrors the web admin rule.
 *
 * After a password sign-in, if the account HAS a verified TOTP
 * factor and the fresh session is only AAL1, the user must present
 * a code (see src/app/mfa.tsx) before entering the app. Accounts
 * without a factor return null here and are never blocked —
 * enrollment is web-only (Admin → Settings on the website).
 *
 * Returns the verified factor's id when a step-up is required,
 * otherwise null. Any error also returns null (fail-open at the UI
 * layer; the server still enforces every permission per request).
 */
export async function getPendingMfaFactorId(): Promise<string | null> {
  try {
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (!aal || aal.currentLevel === "aal2" || aal.nextLevel !== "aal2") {
      return null;
    }
    const { data } = await supabase.auth.mfa.listFactors();
    const verified = data?.totp?.find((f) => f.status === "verified");
    return verified?.id ?? null;
  } catch {
    return null;
  }
}
