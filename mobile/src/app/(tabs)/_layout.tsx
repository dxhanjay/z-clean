import { Tabs } from "expo-router";
import { Text, type ColorValue } from "react-native";
import { useAuth } from "../../context/AuthContext";
import { adminTheme, brand } from "../../lib/config";

function tabIcon(glyph: string) {
  return function TabIcon({ color }: { color: ColorValue }) {
    return <Text style={{ fontSize: 20, color }}>{glyph}</Text>;
  };
}

/**
 * Tab shell. The Admin tab is hidden unless the signed-in user's
 * profile role is 'admin' (href: null) — display gating only; the
 * API re-verifies the role server-side on every admin call.
 */
export default function TabsLayout() {
  const { isAdmin } = useAuth();
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: brand.teal },
        headerTintColor: "#fff",
        headerTitleStyle: { fontWeight: "700" },
        tabBarActiveTintColor: brand.teal,
        tabBarInactiveTintColor: brand.inkSoft,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: "Sri Clean", tabBarLabel: "Home", tabBarIcon: tabIcon("⌂") }}
      />
      <Tabs.Screen
        name="place-order"
        options={{ title: "Place an order", tabBarLabel: "Order", tabBarIcon: tabIcon("＋") }}
      />
      <Tabs.Screen
        name="my-orders"
        options={{ title: "My orders", tabBarLabel: "My Orders", tabBarIcon: tabIcon("▤") }}
      />
      <Tabs.Screen
        name="admin"
        options={{
          title: "Admin — order queue",
          tabBarLabel: "Admin",
          tabBarIcon: tabIcon("⚙"),
          href: isAdmin ? undefined : null,
          // Admin console chrome (redesign): slate header like the
          // web admin shell and the admin stack screens.
          headerStyle: { backgroundColor: adminTheme.slate },
        }}
      />
      <Tabs.Screen
        name="account"
        options={{ title: "Account", tabBarLabel: "Account", tabBarIcon: tabIcon("◉") }}
      />
    </Tabs>
  );
}
