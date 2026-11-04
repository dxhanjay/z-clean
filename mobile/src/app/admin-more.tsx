import { useCallback, useState } from "react";
import * as Linking from "expo-linking";
import { router, useFocusEffect, type Href } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ErrorBlock, GhostButton, Screen, SkeletonRows } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { fetchAdminOrders, fetchFinanceOverview, fetchOutstanding } from "../lib/api";
import { adminTheme, brand, WEB_ADMIN_URL } from "../lib/config";
import { istToday } from "../lib/finance";
import { formatPaise } from "../lib/format";

/**
 * Admin dashboard home (admin redesign) — this screen used to be the
 * plain "More admin tools" index. It now mirrors the web admin's
 * dashboard: a slate header block with the signed-in admin, a 2×2 row
 * of stat tiles (orders today, collected today, in progress,
 * outstanding — the same four metrics, from the same endpoints), and
 * the grouped section menu (Main · Management · Catalogue & Config ·
 * Finance) with the same targets as before.
 *
 * Every section is native: operations (stage queues & handovers,
 * vouchers, employees, branches) and money & insight (finance,
 * expenses, reports, pricing, settings). One "Open web admin" link
 * remains as a convenience for wide tables and printing.
 */

interface DashStats {
  ordersToday: number;
  collectedTodayPaise: number;
  inProgress: number;
  outstandingPaise: number;
  outstandingCount: number;
}

/** yyyy-mm-dd of an instant in Asia/Kolkata — matches the web istToday(). */
function istDateOf(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

const MENU_GROUPS: {
  heading: string;
  items: { label: string; monogram: string; note: string; href: Href }[];
}[] = [
  {
    heading: "Main",
    items: [
      { label: "Order queue", monogram: "OQ", note: "Every order and pickup request", href: "/admin" },
      { label: "Stage queues", monogram: "SQ", note: "Who is waiting at each handover point, per employee", href: "/admin-stages" },
    ],
  },
  {
    heading: "Management",
    items: [
      { label: "Branches & plants", monogram: "BR", note: "Plants, collection centers and branches", href: "/admin-branches" },
      { label: "Employees & roles", monogram: "EM", note: "Staff records across the 12-role matrix", href: "/admin-employees" },
      { label: "Gift vouchers", monogram: "GV", note: "Campaigns, prepaid cards, issue / cancel / expire, history", href: "/admin-vouchers" },
    ],
  },
  {
    heading: "Catalogue & Config",
    items: [
      { label: "Pricing editor", monogram: "PR", note: "Prices and express multipliers — live at checkout on save", href: "/admin-pricing" },
      { label: "Business settings", monogram: "ST", note: "Phone, WhatsApp, delivery thresholds and more", href: "/admin-settings" },
    ],
  },
  {
    heading: "Finance",
    items: [
      { label: "Finance", monogram: "FI", note: "Day summary, cash closing, outstanding balances, refund queue", href: "/admin-finance" },
      { label: "Expenses", monogram: "EX", note: "The spend ledger behind the sales-vs-expense report", href: "/admin-expenses" },
      { label: "Reports & analytics", monogram: "RP", note: "Sales, aging, employee performance, vouchers, retention", href: "/admin-reports" },
    ],
  },
];

function StatTile({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <View style={dash.tile}>
      <Text style={dash.tileLabel}>{label}</Text>
      <Text style={dash.tileValue}>{value}</Text>
      <Text style={dash.tileSub}>{sub}</Text>
    </View>
  );
}

export default function AdminMoreScreen() {
  const { user, profileName } = useAuth();
  const [stats, setStats] = useState<DashStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [orders, overview, outstanding] = await Promise.all([
        fetchAdminOrders(),
        fetchFinanceOverview(istToday()),
        fetchOutstanding(),
      ]);
      const today = istToday();
      setStats({
        ordersToday: orders.filter((o) => istDateOf(o.created_at) === today).length,
        collectedTodayPaise: overview.totalCollectedPaise,
        inProgress: orders.filter((o) => o.status !== "DELIVERED" && o.status !== "CANCELLED").length,
        outstandingPaise: outstanding.reduce((s, r) => s + r.outstandingPaise, 0),
        outstandingCount: outstanding.length,
      });
      setError(null);
    } catch {
      setError("Could not load the dashboard figures.");
    }
  }, []);

  // Reload on focus so the tiles reflect work done in other screens.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const displayName = profileName ?? user?.email ?? "Admin";

  return (
    <Screen admin>
      {/* Slate header block */}
      <View style={dash.headerBlock}>
        <Text style={dash.headerTitle}>Z-clean Admin</Text>
        <Text style={dash.headerName}>{displayName}</Text>
        {profileName && user?.email ? <Text style={dash.headerEmail}>{user.email}</Text> : null}
        <Text style={dash.headerRole}>Administrator</Text>
      </View>

      {/* Stat tiles */}
      {error ? (
        <ErrorBlock message={error} onRetry={() => void load()} />
      ) : !stats ? (
        <SkeletonRows count={2} />
      ) : (
        <View style={dash.tileGrid}>
          <StatTile
            label="Orders today"
            value={String(stats.ordersToday)}
            sub={stats.ordersToday === 0 ? "No orders yet today" : "Placed since midnight (IST)"}
          />
          <StatTile
            label="Collected today"
            value={formatPaise(stats.collectedTodayPaise)}
            sub="Gateway + desk collections"
          />
          <StatTile
            label="In progress"
            value={String(stats.inProgress)}
            sub="Orders not yet delivered"
          />
          <StatTile
            label="Outstanding"
            value={formatPaise(stats.outstandingPaise)}
            sub={
              stats.outstandingCount === 0
                ? "Nothing owed right now"
                : `${stats.outstandingCount} order${stats.outstandingCount === 1 ? "" : "s"} with a balance`
            }
          />
        </View>
      )}

      {/* Grouped menu */}
      {MENU_GROUPS.map((group) => (
        <View key={group.heading} style={dash.group}>
          <Text style={dash.groupHeading}>{group.heading}</Text>
          <View style={dash.groupCard}>
            {group.items.map((item, idx) => (
              <Pressable
                key={item.label}
                onPress={() => router.push(item.href)}
                style={({ pressed }) => [
                  dash.menuRow,
                  idx > 0 && dash.menuRowDivider,
                  pressed && dash.menuRowPressed,
                ]}
              >
                <View style={dash.monogram}>
                  <Text style={dash.monogramText}>{item.monogram}</Text>
                </View>
                <View style={dash.menuText}>
                  <Text style={dash.menuLabel}>{item.label}</Text>
                  <Text style={dash.menuNote}>{item.note}</Text>
                </View>
                <Text style={dash.chevron}>›</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ))}

      {/* Web admin convenience link */}
      <View style={dash.webCard}>
        <Text style={dash.webLabel}>Web admin</Text>
        <Text style={dash.webNote}>
          The full web admin, signed in with the same admin account — handy for wide tables and
          printing.
        </Text>
        <GhostButton label="Open web admin" onPress={() => void Linking.openURL(WEB_ADMIN_URL)} />
      </View>
    </Screen>
  );
}

const dash = StyleSheet.create({
  headerBlock: {
    backgroundColor: adminTheme.slate,
    borderRadius: 14,
    padding: 16,
    gap: 2,
  },
  headerTitle: { fontSize: 20, fontWeight: "800", color: "#fff" },
  headerName: { fontSize: 14, fontWeight: "700", color: "#fff", marginTop: 6 },
  headerEmail: { fontSize: 13, color: "rgba(255,255,255,0.7)" },
  headerRole: {
    fontSize: 11,
    fontWeight: "700",
    color: adminTheme.accent,
    textTransform: "uppercase",
    letterSpacing: 1.2,
    marginTop: 4,
  },
  tileGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  tile: {
    flexBasis: "47%",
    flexGrow: 1,
    backgroundColor: brand.white,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: adminTheme.cardBorder,
    borderLeftWidth: 3,
    borderLeftColor: adminTheme.accent,
    padding: 14,
    gap: 3,
  },
  tileLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: adminTheme.muted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  tileValue: { fontSize: 24, fontWeight: "800", color: adminTheme.heading },
  tileSub: { fontSize: 12, color: adminTheme.muted, lineHeight: 16 },
  group: { gap: 6 },
  groupHeading: {
    fontSize: 11,
    fontWeight: "700",
    color: adminTheme.muted,
    textTransform: "uppercase",
    letterSpacing: 1.2,
    marginLeft: 2,
  },
  groupCard: {
    backgroundColor: brand.white,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: adminTheme.cardBorder,
    overflow: "hidden",
  },
  menuRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 13 },
  menuRowDivider: { borderTopWidth: 1, borderTopColor: adminTheme.cardBorder },
  menuRowPressed: { backgroundColor: adminTheme.panelBg },
  monogram: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: adminTheme.slate,
    alignItems: "center",
    justifyContent: "center",
  },
  monogramText: { color: "#fff", fontSize: 12, fontWeight: "800", letterSpacing: 0.5 },
  menuText: { flex: 1, gap: 1 },
  menuLabel: { fontSize: 15, fontWeight: "700", color: brand.ink },
  menuNote: { fontSize: 12.5, color: adminTheme.muted, lineHeight: 17 },
  chevron: { fontSize: 22, color: adminTheme.muted, fontWeight: "600" },
  webCard: {
    backgroundColor: brand.white,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: adminTheme.cardBorder,
    padding: 14,
    gap: 8,
  },
  webLabel: { fontSize: 13, fontWeight: "700", color: brand.ink },
  webNote: { fontSize: 14, color: brand.inkSoft, lineHeight: 20 },
});
