"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";

const inputClass =
  "w-full rounded-xl border border-brand-200 bg-white px-4 py-3 text-center text-lg font-bold tracking-[0.3em] text-ink-900 placeholder:text-ink-500/60 focus:border-brand-500 focus:outline-none";

/** Only same-site paths may be a post-challenge destination. */
function safeNext(raw: string | null): string {
  if (raw && raw.startsWith("/") && !raw.startsWith("//")) return raw;
  return "/admin";
}

/**
 * MFA challenge (P0) — the step-up page for admins who HAVE a
 * verified TOTP factor. The admin layout redirects here when the
 * session is still AAL1; a successful challenge+verify raises it to
 * AAL2 and we continue to the requested page. Users without a
 * verified factor never belong here and are sent straight on —
 * enrollment is offered (not forced) in Admin → Settings, so nobody
 * can be locked out by this rollout.
 */
function MfaChallenge() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = safeNext(searchParams.get("next"));

  const [phase, setPhase] = useState<"checking" | "ready">("checking");
  const [factorId, setFactorId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const configured = isSupabaseConfigured();

  useEffect(() => {
    if (!configured) return;
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (cancelled) return;
      if (!session) {
        router.replace("/login");
        return;
      }
      const { data: aal } =
        await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (cancelled) return;
      if (aal?.currentLevel === "aal2" || aal?.nextLevel !== "aal2") {
        // Already stepped up, or no verified factor to step up with.
        router.replace(next);
        return;
      }
      const { data: factors } = await supabase.auth.mfa.listFactors();
      if (cancelled) return;
      const verified = factors?.totp?.find((f) => f.status === "verified");
      if (!verified) {
        router.replace(next);
        return;
      }
      setFactorId(verified.id);
      setPhase("ready");
    })();
    return () => {
      cancelled = true;
    };
  }, [configured, next, router]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!factorId) return;
    setError("");
    setSubmitting(true);
    try {
      const supabase = createClient();
      const { data: challenge, error: challengeError } =
        await supabase.auth.mfa.challenge({ factorId });
      if (challengeError || !challenge) {
        setError(challengeError?.message ?? "Could not start the challenge.");
        return;
      }
      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challenge.id,
        code: code.trim(),
      });
      if (verifyError) {
        setError("That code was not accepted. Check the authenticator app and try again.");
        return;
      }
      router.replace(next);
      router.refresh();
    } catch {
      setError("Verification is unavailable right now. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="mx-auto max-w-md px-4 py-14 sm:px-6">
      <h1 className="text-3xl font-extrabold tracking-tight text-ink-900">
        Two-factor check
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-ink-500">
        Enter the 6-digit code from your authenticator app to continue
        to the admin panel.
      </p>

      {!configured && (
        <p role="status" className="mt-6 rounded-xl bg-brand-50 p-4 text-sm text-ink-700">
          Accounts are being set up. This check will open as soon as the
          service configuration is complete.
        </p>
      )}

      {configured && phase === "checking" && (
        <p role="status" className="mt-6 text-sm text-ink-500">
          Checking your session…
        </p>
      )}

      {configured && phase === "ready" && (
        <form onSubmit={handleSubmit} noValidate className="mt-8 grid gap-5">
          <div>
            <label htmlFor="code" className="block text-sm font-semibold text-ink-900">
              Authenticator code
            </label>
            <input
              id="code"
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]*"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              className={inputClass}
              placeholder="••••••"
            />
          </div>
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={submitting || code.length !== 6}
            className="btn-press rounded-full bg-brand-600 px-6 py-3 text-sm font-bold text-white transition-colors hover:bg-brand-700 disabled:opacity-60"
          >
            {submitting ? "Verifying…" : "Verify and continue"}
          </button>
        </form>
      )}
    </section>
  );
}

export default function MfaPage() {
  return (
    <Suspense
      fallback={
        <section className="mx-auto max-w-md px-4 py-14 sm:px-6">
          <p role="status" className="text-sm text-ink-500">
            Checking your session…
          </p>
        </section>
      }
    >
      <MfaChallenge />
    </Suspense>
  );
}
