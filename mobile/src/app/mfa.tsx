import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Text, TextInput } from "react-native";
import { GhostButton, PrimaryButton, Screen, Subtitle, Title, styles } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { getPendingMfaFactorId } from "../lib/mfa";
import { supabase } from "../lib/supabase";

/**
 * Two-factor step-up (P0) — shown right after sign-in when the
 * account has a verified TOTP factor but the session is still
 * AAL1. Verifying raises the session to AAL2 and continues into
 * the app. Cancelling signs the user back out: a half-verified
 * session never lingers in the app.
 *
 * Enrollment is NOT here — factors are managed on the website
 * (Admin → Settings → Admin security), as the copy states.
 */
export default function MfaScreen() {
  const { signOut } = useAuth();
  const [factorId, setFactorId] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const id = await getPendingMfaFactorId();
      if (cancelled) return;
      if (!id) {
        // Nothing to step up (no verified factor / already AAL2).
        router.back();
        return;
      }
      setFactorId(id);
      setChecking(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function verify() {
    if (!factorId) return;
    setError(null);
    setBusy(true);
    const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
      factorId,
    });
    if (challengeError || !challenge) {
      setBusy(false);
      setError(challengeError?.message ?? "Could not start the challenge. Try again.");
      return;
    }
    const { error: verifyError } = await supabase.auth.mfa.verify({
      factorId,
      challengeId: challenge.id,
      code: code.trim(),
    });
    setBusy(false);
    if (verifyError) {
      setError("That code was not accepted. Check the authenticator app and try again.");
      return;
    }
    router.back();
  }

  async function cancel() {
    await signOut();
    router.back();
  }

  return (
    <Screen>
      <Title>Two-factor check</Title>
      <Subtitle>
        Enter the 6-digit code from your authenticator app to finish signing in. Two-factor
        codes are set up on the Z-clean website under Admin → Settings — they cannot be
        enrolled in the app.
      </Subtitle>
      {checking ? (
        <Text style={styles.subtitle}>Checking your session…</Text>
      ) : (
        <>
          <TextInput
            style={styles.input}
            placeholder="6-digit code"
            value={code}
            onChangeText={(t) => setCode(t.replace(/\D/g, ""))}
            keyboardType="number-pad"
            autoComplete="one-time-code"
            maxLength={6}
          />
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          <PrimaryButton
            label="Verify and continue"
            onPress={verify}
            busy={busy}
            disabled={code.length !== 6}
          />
          <GhostButton label="Cancel and sign out" onPress={cancel} />
        </>
      )}
    </Screen>
  );
}
