import { router, useFocusEffect } from "expo-router";
import { memo, useCallback, useMemo, useState } from "react";
import { FlatList, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import {
  Badge,
  Card,
  Chip,
  EmptyBlock,
  ErrorBlock,
  GhostButton,
  Screen,
  SkeletonRows,
  Title,
  paymentBadgeTone,
  styles,
} from "../../components/ui";
import { useAuth } from "../../context/AuthContext";
import { fetchAdminOrders } from "../../lib/api";
import { brand } from "../../lib/config";
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

const OrderRow = memo(function OrderRow({
  order: o,
  onPress,
}: {
  order: AdminOrderSummary;
  onPress: (id: string) => void;
}) {
  return (
    <Pressable onPress={() => onPress(o.id)}>
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
  );
});

export default function AdminQueueScreen() {
  const { isAdmin } = useAuth();
  const [orders, setOrders] = useState<AdminOrderSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("ALL");
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setOrders(await fetchAdminOrders());
    } catch {
      setError("Could not load the order queue. Check the connection and try again.");
    }
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }, [load]);

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

  const openOrder = useCallback((id: string) => {
    router.push(`/admin-order/${id}`);
  }, []);

  if (!isAdmin) {
    return (
      <Screen>
        <Title>Admin</Title>
        <Text style={styles.muted}>This section is for Z-clean admins only.</Text>
      </Screen>
    );
  }

  const header = (
    <>
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
    </>
  );

  if (!orders && !error) {
    return (
      <Screen>
        {header}
        <SkeletonRows />
      </Screen>
    );
  }

  return (
    <Screen scroll={false}>
      <FlatList
        data={visible}
        keyExtractor={(o) => o.id}
        renderItem={({ item }) => <OrderRow order={item} onPress={openOrder} />}
        ListHeaderComponent={header}
        ListEmptyComponent={
          error ? (
            <ErrorBlock message={error} onRetry={() => void load()} />
          ) : (
            <EmptyBlock
              message={filter === "ALL" ? "No orders yet." : `No orders at “${statusLabel(filter)}”.`}
            />
          )
        }
        contentContainerStyle={styles.screenContent}
        initialNumToRender={10}
        windowSize={11}
        removeClippedSubviews
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={brand.teal} colors={[brand.teal]} />
        }
      />
    </Screen>
  );
}
