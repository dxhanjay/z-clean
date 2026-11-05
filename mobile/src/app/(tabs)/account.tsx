import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Text } from "react-native";
import * as Linking from "expo-linking";
import { ToggleRow } from "../../components/forms";
import SupportCard from "../../components/SupportCard";
import {
  Card,
  GhostButton,
  PrimaryButton,
  Screen,
  Subtitle,
  Title,
  styles,
} from "../../components/ui";
import { useAuth } from "../../context/AuthContext";
import { API_BASE_URL } from "../../lib/config";
import { applyPushPreference, getPushEnabled } from "../../lib/push";
import { roleLabel } from "../../lib/roles";

/** Account — who you're signed in as, role, sign out, useful links. */
export default function AccountScreen() {
  const { user, isAdmin, role, profileName, signOut } = useAuth();
  const [pushEnabled, setPushEnabled] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void getPushEnabled().then((enabled) => {
      if (!cancelled) setPushEnabled(enabled);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!user) {
    return (
      <Screen>
        <Title>Account</Title>
        <Subtitle>You are browsing as a guest. Sign in to place and track orders.</Subtitle>
        <PrimaryButton label="Sign in" onPress={() => router.push("/login")} />
        <GhostButton label="Create an account" onPress={() => router.push("/register")} />
        <SupportCard />
      </Screen>
    );
  }

  return (
    <Screen>
      <Title>{profileName ?? "Your account"}</Title>
      <Card>
        <Text style={styles.muted}>Email</Text>
        <Text style={{ fontWeight: "700" }}>{user.email}</Text>
        <Text style={styles.muted}>Role</Text>
        <Text style={{ fontWeight: "700" }}>{roleLabel(role)}</Text>
      </Card>
      <Card>
        <Text style={styles.label}>Notifications</Text>
        <ToggleRow
          label="Order updates"
          value={pushEnabled}
          onValueChange={(value) => {
            setPushEnabled(value);
            void applyPushPreference(value);
          }}
        />
        <Text style={styles.muted}>
          Push alerts when your order is picked up, cleaned, out for delivery and
          delivered. Turning this off also removes this device&apos;s registration.
        </Text>
      </Card>
      <SupportCard />
      {isAdmin && (
        <GhostButton label="Open the web admin" onPress={() => void Linking.openURL(`${API_BASE_URL}/admin`)} />
      )}
      <GhostButton
        label="Sign out"
        onPress={async () => {
          await signOut();
          router.replace("/(tabs)");
        }}
      />
    </Screen>
  );
}
