import { router, useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import {
  Badge,
  Card,
  Chip,
  EmptyBlock,
  ErrorBlock,
  GhostButton,
  LoadingBlock,
  Screen,
  Title,
  paymentBadgeTone,
  styles,
} from "../../components/ui";
import { useAuth } from "../../context/AuthContext";
import { fetchAdminOrders } from "../../lib/api";
import { formatPaise, formatWhen } from "../../lib/format";
import { ALL_ORDER_STATUSES, statusLabel } from "../../lib/order-flow";
import type { AdminOrderSummary } from "../../lib/types";

/**
 * Admin order queue (Mobile Phase 1) — GET /api/admin/orders with
 * the admin's Bearer token; the server re-verifies the admin role.
 * Filter by status; tap an order for detail + status actions.
 * Handover completion (Phase 8 chain) sits on each order; the other
 * admin sections live under "More admin tools" (native since Mobile
 * Phase 2, except finance/reports/pricing/settings — Phase 3).
 */
export default function AdminQueueScreen() {
  const { isAdmin } = useAuth();
  const [orders, setOrders] = useState<AdminOrderSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("ALL");

  const load = useCallback(async () => {
    setError(null);
    try {
      setOrders(await fetchAdminOrders());
    } catch {
      setError("Could not load the order queue. Check the connection and try again.");
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (isAdmin) void load();
    }, [isAdmin, load]),
  );

  const visible = useMemo(() => {
    if (!orders) return [];
    if (filter === "ALL") return orders;
    return orders.filter((o) => o.status === filter);
  }, [orders, filter]);

  if (!isAdmin) {
    return (
      <Screen>
        <Title>Admin</Title>
        <Text style={styles.muted}>This section is for Z-clean admins only.</Text>
      </Screen>
    );
  }

  return (
    <Screen>
      <Title>Order queue</Title>
      <GhostButton label="More admin tools" onPress={() => router.push("/admin-more")} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={{ flexDirection: "row", gap: 8, paddingVertical: 2 }}>
          <Chip label="All" selected={filter === "ALL"} onPress={() => setFilter("ALL")} />
          {ALL_ORDER_STATUSES.map((s) => (
            <Chip key={s} label={statusLabel(s)} selected={filter === s} onPress={() => setFilter(s)} />
          ))}
        </View>
      </ScrollView>

      {error ? (
        <ErrorBlock message={error} onRetry={() => void load()} />
      ) : !orders ? (
        <LoadingBlock label="Loading the queue…" />
      ) : visible.length === 0 ? (
        <EmptyBlock message={filter === "ALL" ? "No orders yet." : `No orders at “${statusLabel(filter)}”.`} />
      ) : (
        visible.map((o) => (
          <Pressable key={o.id} onPress={() => router.push(`/admin-order/${o.id}`)}>
            <Card>
              <View style={styles.rowBetween}>
                <Text style={{ fontWeight: "800" }}>
                  {o.profiles?.name ?? "Customer"} · {formatPaise(o.total_paise)}
                </Text>
                <Text style={styles.muted}>{formatWhen(o.created_at)}</Text>
              </View>
              <View style={styles.rowWrap}>
                <Badge label={statusLabel(o.status)} />
                <Badge label={o.payment_status.replaceAll("_", " ")} tone={paymentBadgeTone(o.payment_status)} />
                {o.delivery_type === "express" ? <Badge label="Express" tone="grey" /> : null}
              </View>
              <Text style={styles.muted}>
                {o.addresses ? `${o.addresses.area ?? ""}, ${o.addresses.city} — ${o.addresses.pincode} · ` : ""}
                Pickup {formatWhen(o.pickup_slot)}
                {o.profiles?.phone ? ` · ${o.profiles.phone}` : ""}
              </Text>
            </Card>
          </Pressable>
        ))
      )}
    </Screen>
  );
}
