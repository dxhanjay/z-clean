import { router } from "expo-router";
import { useState } from "react";
import { Text, TextInput } from "react-native";
import { GhostButton, PrimaryButton, Screen, Subtitle, Title, styles } from "../components/ui";
import { useAuth } from "../context/AuthContext";

/** Register — creates the same kind of account as the web sign-up. */
export default function RegisterScreen() {
  const { signUp } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function submit() {
    setError(null);
    if (name.trim().length < 2) return setError("Enter your full name.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setError("Enter a valid email address.");
    if (!/^[+]?[\d\s-]{10,15}$/.test(phone.trim())) return setError("Enter a valid phone number.");
    if (password.length < 8) return setError("Password must be at least 8 characters.");
    if (password !== confirm) return setError("Passwords do not match.");

    setBusy(true);
    const { error: err, needsConfirmation } = await signUp(name, email, phone, password);
    setBusy(false);
    if (err) {
      setError(err);
      return;
    }
    if (needsConfirmation) {
      setNotice("Account created — please confirm it from the email we sent, then sign in.");
      return;
    }
    router.back();
  }

  return (
    <Screen>
      <Title>Create your account</Title>
      <Subtitle>One account for the app and the website — orders, tracking and receipts.</Subtitle>
      <TextInput style={styles.input} placeholder="Full name" value={name} onChangeText={setName} autoComplete="name" />
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
        placeholder="Phone number"
        value={phone}
        onChangeText={setPhone}
        keyboardType="phone-pad"
        autoComplete="tel"
      />
      <TextInput
        style={styles.input}
        placeholder="Password (8+ characters)"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="new-password"
      />
      <TextInput
        style={styles.input}
        placeholder="Confirm password"
        value={confirm}
        onChangeText={setConfirm}
        secureTextEntry
        autoComplete="new-password"
      />
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      {notice ? <Text style={styles.muted}>{notice}</Text> : null}
      <PrimaryButton label="Create account" onPress={submit} busy={busy} />
      <GhostButton label="Already have an account? Sign in" onPress={() => router.replace("/login")} />
    </Screen>
  );
}
