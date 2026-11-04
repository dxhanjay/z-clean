import { router } from "expo-router";
import { useState } from "react";
import { Text, TextInput } from "react-native";
import { GhostButton, PrimaryButton, Screen, Subtitle, Title, styles } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { requestPasswordReset } from "../lib/api";
import { getPendingMfaFactorId } from "../lib/mfa";

/** Sign in — same Supabase accounts as the web app. */
export default function LoginScreen() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showReset, setShowReset] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  async function submit() {
    setError(null);
    if (!email.trim() || !password) {
      setError("Enter your email and password.");
      return;
    }
    setBusy(true);
    const { error: err } = await signIn(email, password);
    if (err) {
      setBusy(false);
      setError(err);
      return;
    }
    // MFA step-up (P0): accounts with a verified TOTP factor must
    // present a code before entering the app (see app/mfa.tsx).
    const factorId = await getPendingMfaFactorId();
    setBusy(false);
    if (factorId) {
      router.replace("/mfa");
      return;
    }
    router.back();
  }

  async function sendReset() {
    setError(null);
    if (!email.trim()) {
      setError("Enter your email above first.");
      return;
    }
    setResetBusy(true);
    try {
      await requestPasswordReset(email.trim().toLowerCase());
    } catch {
      // The endpoint answers 200 either way by design; a network
      // failure lands here and gets the same neutral confirmation.
    }
    setResetBusy(false);
    setResetSent(true);
  }

  return (
    <Screen>
      <Title>Welcome back</Title>
      <Subtitle>Sign in with the same account you use on the Z-clean website.</Subtitle>
      <TextInput
        style={styles.input}
        placeholder="Email address"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        autoComplete="email"
      />
      <TextInput
        style={styles.input}
        placeholder="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="password"
      />
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      <PrimaryButton label="Sign in" onPress={submit} busy={busy} />
      <GhostButton label="New here? Create an account" onPress={() => router.replace("/register")} />
      <GhostButton
        label="Forgot password?"
        onPress={() => {
          setShowReset((v) => !v);
          setResetSent(false);
        }}
      />
      {showReset ? (
        <>
          {resetSent ? (
            <Text style={styles.subtitle}>
              If an account exists for that email, a reset link is on its way. The link opens
              the Z-clean website, where you set a new password — then sign in here with it.
            </Text>
          ) : (
            <>
              <Text style={styles.subtitle}>
                We will email you a password-reset link. The link opens the Z-clean website
                to set a new password (there is no in-app reset screen) — then come back and
                sign in here.
              </Text>
              <PrimaryButton label="Email me a reset link" onPress={sendReset} busy={resetBusy} />
            </>
          )}
        </>
      ) : null}
    </Screen>
  );
}
