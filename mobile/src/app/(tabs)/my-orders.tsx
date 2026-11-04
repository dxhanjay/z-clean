import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, Text, View } from "react-native";
import {
  Badge,
  Card,
  EmptyBlock,
  ErrorBlock,
  LoadingBlock,
  PrimaryButton,
  Screen,
  Title,
  paymentBadgeTone,
  styles,
} from "../../components/ui";
import { useAuth } from "../../context/AuthContext";
import { fetchMyOrders } from "../../lib/api";
import { formatPaise, formatWhen } from "../../lib/format";
import { statusLabel } from "../../lib/order-flow";
import type { MyOrderSummary } from "../../lib/types";

/** My Orders — the signed-in customer's orders (GET /api/orders). */
export default function MyOrdersScreen() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<MyOrderSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setError(null);
    try {
      setOrders(await fetchMyOrders());
    } catch {
      setError("Could not load your orders. Pull to retry from the button below.");
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (!user) {
    return (
      <Screen>
        <Title>My orders</Title>
        <Text style={styles.muted}>Sign in to see and track your orders.</Text>
        <PrimaryButton label="Sign in" onPress={() => router.push("/login")} />
      </Screen>
    );
  }

  return (
    <Screen>
      <Title>My orders</Title>
      {error ? (
        <ErrorBlock message={error} onRetry={() => void load()} />
      ) : !orders ? (
        <LoadingBlock label="Loading your orders…" />
      ) : orders.length === 0 ? (
        <>
          <EmptyBlock message="No orders yet — your placed orders will show up here." />
          <PrimaryButton label="Place your first order" onPress={() => router.push("/(tabs)/place-order")} />
        </>
      ) : (
        orders.map((o) => {
          const count = (o.order_items ?? []).reduce((s, i) => s + Number(i.qty), 0);
          return (
            <Pressable key={o.id} onPress={() => router.push(`/order/${o.id}`)}>
              <Card>
                <View style={styles.rowBetween}>
                  <Text style={{ fontWeight: "800", color: "#1f2937" }}>
                    Order {o.id.slice(0, 8).toUpperCase()}…
                  </Text>
                  <Text style={styles.totalValue}>{formatPaise(o.total_paise)}</Text>
                </View>
                <View style={styles.rowWrap}>
                  <Badge label={statusLabel(o.status)} />
                  <Badge label={o.payment_status.replaceAll("_", " ")} tone={paymentBadgeTone(o.payment_status)} />
                </View>
                <Text style={styles.muted}>
                  Placed {formatWhen(o.created_at)} · Pickup {formatWhen(o.pickup_slot)}
                  {count > 0 ? ` · ${count} item${count === 1 ? "" : "s"}` : ""}
                  {o.delivery_type === "express" ? " · Express" : ""}
                </Text>
              </Card>
            </Pressable>
          );
        })
      )}
    </Screen>
  );
}
