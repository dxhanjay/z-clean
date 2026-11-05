import { router } from "expo-router";
import { Text } from "react-native";
import * as Linking from "expo-linking";
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
import { roleLabel } from "../../lib/roles";

/** Account — who you're signed in as, role, sign out, useful links. */
export default function AccountScreen() {
  const { user, isAdmin, role, profileName, signOut } = useAuth();

  if (!user) {
    return (
      <Screen>
        <Title>Account</Title>
        <Subtitle>You are browsing as a guest. Sign in to place and track orders.</Subtitle>
        <PrimaryButton label="Sign in" onPress={() => router.push("/login")} />
        <GhostButton label="Create an account" onPress={() => router.push("/register")} />
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
