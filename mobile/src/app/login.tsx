import { router } from "expo-router";
import { useState } from "react";
import { Text, TextInput } from "react-native";
import { GhostButton, PrimaryButton, Screen, Subtitle, Title, styles } from "../components/ui";
import { useAuth } from "../context/AuthContext";

/** Sign in — same Supabase accounts as the web app. */
export default function LoginScreen() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    if (!email.trim() || !password) {
      setError("Enter your email and password.");
      return;
    }
    setBusy(true);
    const { error: err } = await signIn(email, password);
    setBusy(false);
    if (err) {
      setError(err);
      return;
    }
    router.back();
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
    </Screen>
  );
}
