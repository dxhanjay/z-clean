import * as Linking from "expo-linking";
import { Text } from "react-native";
import { Card, PrimaryButton, Screen, Subtitle, Title, styles } from "../components/ui";
import { WEB_ADMIN_URL } from "../lib/config";

/**
 * More admin tools (Mobile Phase 1) — an honest index, not fake
 * screens. The in-app admin covers the order queue + status/COD
 * actions; everything below is fully built in the WEB admin and
 * arrives in the app in Mobile Phases 2 (handovers) and 3
 * (finance). Until then, these buttons open the real thing.
 */
const WEB_SECTIONS: { label: string; path: string; phase: string }[] = [
  { label: "Stage queues & QR/OTP handovers", path: "/admin/stages", phase: "Mobile Phase 2" },
  { label: "Finance — payments, refunds, closing", path: "/admin/finance", phase: "Mobile Phase 3" },
  { label: "Reports & analytics", path: "/admin/reports", phase: "Mobile Phase 3" },
  { label: "Branches & plants", path: "/admin/branches", phase: "Web only for now" },
  { label: "Employees & roles", path: "/admin/employees", phase: "Web only for now" },
  { label: "Gift vouchers", path: "/admin/vouchers", phase: "Web only for now" },
  { label: "Pricing editor", path: "/admin/pricing", phase: "Web only for now" },
  { label: "Business settings", path: "/admin/settings", phase: "Web only for now" },
];

export default function AdminMoreScreen() {
  return (
    <Screen>
      <Title>More admin tools</Title>
      <Subtitle>
        These sections are complete in the web admin. They open in your browser, signed in with the
        same admin account.
      </Subtitle>
      {WEB_SECTIONS.map((s) => (
        <Card key={s.path}>
          <Text style={styles.label}>{s.label}</Text>
          <Text style={styles.muted}>{s.phase}</Text>
          <PrimaryButton
            label="Open in web admin"
            onPress={() => void Linking.openURL(`${WEB_ADMIN_URL.replace(/\/admin$/, "")}${s.path}`)}
          />
        </Card>
      ))}
    </Screen>
  );
}
