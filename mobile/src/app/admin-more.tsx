import * as Linking from "expo-linking";
import { router } from "expo-router";
import { Text } from "react-native";
import { Card, GhostButton, PrimaryButton, Screen, Subtitle, Title, styles } from "../components/ui";
import { WEB_ADMIN_URL } from "../lib/config";

/**
 * More admin tools — the admin index.
 *
 * Mobile Phase 2 made the operations sections native: stage queues
 * & handovers, gift vouchers, employees and branches all live in the
 * app now (handover completion itself sits on each admin order).
 * Finance, reports, pricing and settings are complete in the WEB
 * admin and arrive in Mobile Phase 3; until then these buttons open
 * the real thing in the browser — no fake screens.
 */
const NATIVE_SECTIONS: {
  label: string;
  note: string;
  href: "/admin-stages" | "/admin-vouchers" | "/admin-employees" | "/admin-branches";
}[] = [
  { label: "Stage queues", note: "Who is waiting at each handover point, per employee", href: "/admin-stages" },
  { label: "Gift vouchers", note: "Campaigns, prepaid cards, issue / cancel / expire, history", href: "/admin-vouchers" },
  { label: "Employees & roles", note: "Staff records across the 12-role matrix", href: "/admin-employees" },
  { label: "Branches & plants", note: "Plants, collection centers and branches", href: "/admin-branches" },
];

const WEB_SECTIONS: { label: string; path: string; phase: string }[] = [
  { label: "Finance — payments, refunds, closing", path: "/admin/finance", phase: "Mobile Phase 3" },
  { label: "Reports & analytics", path: "/admin/reports", phase: "Mobile Phase 3" },
  { label: "Pricing editor", path: "/admin/pricing", phase: "Mobile Phase 3" },
  { label: "Business settings", path: "/admin/settings", phase: "Mobile Phase 3" },
];

export default function AdminMoreScreen() {
  return (
    <Screen>
      <Title>More admin tools</Title>
      <Subtitle>
        Operations run natively in the app. Handover completion lives on each order in the Admin
        queue.
      </Subtitle>

      {NATIVE_SECTIONS.map((s) => (
        <Card key={s.href}>
          <Text style={styles.label}>{s.label}</Text>
          <Text style={styles.muted}>{s.note}</Text>
          <PrimaryButton label="Open" onPress={() => router.push(s.href)} />
        </Card>
      ))}

      <Subtitle>
        These sections are complete in the web admin and arrive in the app in Mobile Phase 3. They
        open in your browser, signed in with the same admin account.
      </Subtitle>
      {WEB_SECTIONS.map((s) => (
        <Card key={s.path}>
          <Text style={styles.label}>{s.label}</Text>
          <Text style={styles.muted}>{s.phase}</Text>
          <GhostButton
            label="Open in web admin"
            onPress={() => void Linking.openURL(`${WEB_ADMIN_URL.replace(/\/admin$/, "")}${s.path}`)}
          />
        </Card>
      ))}
    </Screen>
  );
}
