import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, Text, View } from "react-native";
import {
  Badge,
  Card,
  EmptyBlock,
  ErrorBlock,
  LoadingBlock,
  Screen,
  Title,
  styles,
} from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { fetchAdminNotifications } from "../lib/api";
import type { AdminNotificationItem } from "../lib/types";

/**
 * Admin notifications (Delta 1) — read-only list over
 * GET /api/admin/notifications. Items are derived on the server,
 * never stored, so there is nothing to dismiss: doing the work
 * clears the item. Tapping an order item opens the order; finance
 * and voucher items open the matching admin section.
 */

const SEVERITY_TONE: Record<
  AdminNotificationItem["severity"],
  "red" | "amber" | "grey"
> = { high: "red", medium: "amber", low: "grey" };

const SEVERITY_LABEL: Record<AdminNotificationItem["severity"], string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
};

/** Map the web href of a notification to the closest app route. */
function routeFor(item: AdminNotificationItem): string | null {
  const orderMatch = item.href.match(/^\/admin\/orders\/(.+)$/);
  if (orderMatch) return `/admin-order/${orderMatch[1]}`;
  if (item.href === "/admin/finance") return "/admin-finance";
  if (item.href === "/admin/vouchers") return "/admin-vouchers";
  if (item.href === "/admin/orders") return "/admin";
  return null;
}

export default function AdminNotificationsScreen() {
  const { isAdmin } = useAuth();
  const [items, setItems] = useState<AdminNotificationItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await fetchAdminNotifications();
      setItems(data.items);
    } catch {
      setError("Could not load notifications. Check the connection and try again.");
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (isAdmin) void load();
    }, [isAdmin, load]),
  );

  if (!isAdmin) {
    return (
      <Screen admin>
        <Title>Notifications</Title>
        <Text style={styles.muted}>This section is for Sri Clean admins only.</Text>
      </Screen>
    );
  }

  return (
    <Screen admin>
      <Title>Notifications</Title>
      <Text style={styles.subtitle}>
        What needs a human right now — refunds waiting, stuck orders, failed
        payments, expiring vouchers, unclosed cash days. Items clear
        themselves when the work is done.
      </Text>

      {error ? (
        <ErrorBlock message={error} onRetry={() => void load()} />
      ) : items === null ? (
        <LoadingBlock label="Loading notifications…" />
      ) : items.length === 0 ? (
        <EmptyBlock message="All clear — nothing needs attention right now." />
      ) : (
        items.map((item) => {
          const route = routeFor(item);
          const body = (
            <Card>
              <View style={styles.rowBetween}>
                <Badge
                  label={SEVERITY_LABEL[item.severity]}
                  tone={SEVERITY_TONE[item.severity]}
                />
                <Text style={styles.muted}>
                  {new Date(item.at).toLocaleDateString("en-IN", {
                    day: "numeric",
                    month: "short",
                  })}
                </Text>
              </View>
              <Text style={{ fontWeight: "700", fontSize: 15, lineHeight: 21 }}>
                {item.title}
              </Text>
              <Text style={{ fontSize: 13.5, color: "#5b6b7c", lineHeight: 19 }}>
                {item.detail}
              </Text>
            </Card>
          );
          return route ? (
            <Pressable key={item.id} onPress={() => router.push(route as never)}>
              {body}
            </Pressable>
          ) : (
            <View key={item.id}>{body}</View>
          );
        })
      )}
    </Screen>
  );
}
