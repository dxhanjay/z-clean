import * as Linking from "expo-linking";
import { router } from "expo-router";
import { Text } from "react-native";
import { Card, GhostButton, PrimaryButton, Screen, Subtitle, Title, styles } from "../components/ui";
import { WEB_ADMIN_URL } from "../lib/config";

/**
 * More admin tools — the admin index.
 *
 * As of Mobile Phase 3 every admin section is native in the app:
 * operations (Phase 2 — stage queues & handovers, vouchers,
 * employees, branches) and money & insight (Phase 3 — finance,
 * expenses, reports, pricing, settings). Handover completion and
 * per-order payments/refunds live on each admin order. One plain
 * "Open web admin" link remains as a convenience.
 */
const NATIVE_SECTIONS: {
  label: string;
  note: string;
  href:
    | "/admin-stages"
    | "/admin-vouchers"
    | "/admin-employees"
    | "/admin-branches"
    | "/admin-finance"
    | "/admin-expenses"
    | "/admin-reports"
    | "/admin-pricing"
    | "/admin-settings";
}[] = [
  { label: "Stage queues", note: "Who is waiting at each handover point, per employee", href: "/admin-stages" },
  { label: "Gift vouchers", note: "Campaigns, prepaid cards, issue / cancel / expire, history", href: "/admin-vouchers" },
  { label: "Employees & roles", note: "Staff records across the 12-role matrix", href: "/admin-employees" },
  { label: "Branches & plants", note: "Plants, collection centers and branches", href: "/admin-branches" },
  { label: "Finance", note: "Day summary, cash closing, outstanding balances, refund queue", href: "/admin-finance" },
  { label: "Expenses", note: "The spend ledger behind the sales-vs-expense report", href: "/admin-expenses" },
  { label: "Reports & analytics", note: "Sales, aging, employee performance, vouchers, retention", href: "/admin-reports" },
  { label: "Pricing editor", note: "Prices and express multipliers — live at checkout on save", href: "/admin-pricing" },
  { label: "Business settings", note: "Phone, WhatsApp, delivery thresholds and more", href: "/admin-settings" },
];

export default function AdminMoreScreen() {
  return (
    <Screen>
      <Title>More admin tools</Title>
      <Subtitle>
        Everything runs natively in the app. Handover completion and per-order payments & refunds
        live on each order in the Admin queue.
      </Subtitle>

      {NATIVE_SECTIONS.map((s) => (
        <Card key={s.href}>
          <Text style={styles.label}>{s.label}</Text>
          <Text style={styles.muted}>{s.note}</Text>
          <PrimaryButton label="Open" onPress={() => router.push(s.href)} />
        </Card>
      ))}

      <Card>
        <Text style={styles.label}>Web admin</Text>
        <Text style={styles.muted}>
          The full web admin, signed in with the same admin account — handy for wide tables and
          printing.
        </Text>
        <GhostButton label="Open web admin" onPress={() => void Linking.openURL(WEB_ADMIN_URL)} />
      </Card>
    </Screen>
  );
}
