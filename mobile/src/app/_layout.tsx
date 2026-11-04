import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { ActivityIndicator, Text, View } from "react-native";
import { AuthProvider, useAuth } from "../context/AuthContext";
import { brand } from "../lib/config";

/**
 * Root navigator (Mobile Phase 1): tab shell plus stack screens for
 * auth and order details. The Admin tab itself is hidden for
 * non-admins inside the tab layout.
 *
 * Auth gate (polish): while the persisted session is still resolving
 * (AuthContext.loading), render only a splash/loading state — never
 * the navigator. Screens branch on `user`/`isAdmin`, so rendering
 * them during resolution flashed the signed-out UI (e.g. the
 * "Sign in to place an order" prompt) at signed-in users on launch.
 */
function RootNavigator() {
  const { loading } = useAuth();

  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: brand.pageBg,
          alignItems: "center",
          justifyContent: "center",
          gap: 12,
        }}
      >
        <ActivityIndicator color={brand.teal} size="large" />
        <Text style={{ fontSize: 15, fontWeight: "700", color: brand.tealDark }}>Z-clean</Text>
      </View>
    );
  }

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: brand.teal },
        headerTintColor: "#fff",
        headerTitleStyle: { fontWeight: "700" },
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="login" options={{ title: "Sign in" }} />
      <Stack.Screen name="register" options={{ title: "Create account" }} />
      <Stack.Screen name="order/[id]" options={{ title: "Order details" }} />
      <Stack.Screen name="admin-order/[id]" options={{ title: "Admin — order" }} />
      <Stack.Screen name="admin-more" options={{ title: "More admin tools" }} />
      <Stack.Screen name="admin-stages" options={{ title: "Admin — stage queues" }} />
      <Stack.Screen name="admin-vouchers" options={{ title: "Admin — gift vouchers" }} />
      <Stack.Screen name="admin-employees" options={{ title: "Admin — employees" }} />
      <Stack.Screen name="admin-branches" options={{ title: "Admin — branches" }} />
      <Stack.Screen name="admin-finance" options={{ title: "Admin — finance" }} />
      <Stack.Screen name="admin-expenses" options={{ title: "Admin — expenses" }} />
      <Stack.Screen name="admin-reports" options={{ title: "Admin — reports" }} />
      <Stack.Screen name="admin-pricing" options={{ title: "Admin — pricing" }} />
      <Stack.Screen name="admin-settings" options={{ title: "Admin — settings" }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <StatusBar style="light" />
      <RootNavigator />
    </AuthProvider>
  );
}
