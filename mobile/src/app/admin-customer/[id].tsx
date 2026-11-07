import { useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import { Alert, Text, View } from "react-native";
import {
  Badge,
  Card,
  EmptyBlock,
  ErrorBlock,
  GhostButton,
  LoadingBlock,
  PrimaryButton,
  Screen,
  Title,
  styles,
} from "../../components/ui";
import { useAuth } from "../../context/AuthContext";
import { ApiError, fetchAdminCustomer, patchCustomerDisabled } from "../../lib/api";
import { formatPaise } from "../../lib/format";
import { statusLabel } from "../../lib/order-flow";
import { roleLabel } from "../../lib/roles";
import type { AdminCustomerDetailData } from "../../lib/types";

/**
 * Customer detail (Delta 1) — read-only profile, addresses, recent
 * orders and active vouchers, plus the disable/enable switch for
 * admin-tier accounts (the server enforces the same minimum and
 * answers 403 FORBIDDEN_ROLE below it). A disabled customer keeps
 * sign-in and history but cannot order or request pickups.
 */

function KvRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.totalRow}>
      <Text style={styles.totalLabel}>{label}</Text>
      <Text style={styles.totalValue}>{value}</Text>
    </View>
  );
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function AdminCustomerDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { isAdmin, roleLevel } = useAuth();
  const [data, setData] = useState<AdminCustomerDetailData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setError(null);
    try {
      setData(await fetchAdminCustomer(id));
    } catch {
      setError("Could not load this customer.");
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      if (isAdmin) void load();
    }, [isAdmin, load]),
  );

  const toggleDisabled = useCallback(() => {
    if (!data || !id) return;
    const next = !data.customer.disabled;
    Alert.alert(
      next ? "Disable this account?" : "Enable this account?",
      next
        ? "They will no longer be able to place orders or request pickups. Sign-in and order history stay available."
        : "They will be able to order again immediately.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: next ? "Disable" : "Enable",
          style: next ? "destructive" : "default",
          onPress: () => {
            void (async () => {
              setBusy(true);
              try {
                const result = await patchCustomerDisabled(id, next);
                setData({
                  ...data,
                  customer: { ...data.customer, disabled: result.customer.disabled },
                });
              } catch (e) {
                Alert.alert(
                  "Customers",
                  e instanceof ApiError ? e.message : "Could not update the account.",
                );
              } finally {
                setBusy(false);
              }
            })();
          },
        },
      ],
    );
  }, [data, id]);

  if (!isAdmin) {
    return (
      <Screen admin>
        <Title>Customer</Title>
        <Text style={styles.muted}>This section is for Sri Clean admins only.</Text>
      </Screen>
    );
  }

  if (error) {
    return (
      <Screen admin>
        <Title>Customer</Title>
        <ErrorBlock message={error} onRetry={() => void load()} />
      </Screen>
    );
  }

  if (!data) {
    return (
      <Screen admin>
        <LoadingBlock label="Loading customer…" />
      </Screen>
    );
  }

  const c = data.customer;
  const canManage = roleLevel >= 2;

  return (
    <Screen admin>
      <Title>{c.name ?? "Unnamed customer"}</Title>
      <View style={{ flexDirection: "row", gap: 8 }}>
        {c.disabled ? (
          <Badge label="Disabled" tone="red" />
        ) : (
          <Badge label="Active" tone="green" />
        )}
        <Badge label={roleLabel(c.role)} tone="grey" />
      </View>

      <Card>
        <KvRow label="Phone" value={c.phone ?? "—"} />
        <KvRow label="Email" value={c.email ?? "—"} />
        <KvRow label="Joined" value={formatDate(c.createdAt)} />
        <KvRow label="Orders (excl. cancelled)" value={String(c.ordersCount)} />
        <KvRow label="Last order" value={formatDate(c.lastOrderAt)} />
        <KvRow label="Lifetime spend" value={formatPaise(c.lifetimeSpendPaise)} />
        <KvRow label="Outstanding" value={formatPaise(c.outstandingPaise)} />
      </Card>

      {canManage ? (
        c.disabled ? (
          <PrimaryButton
            label={busy ? "Saving…" : "Enable account"}
            onPress={toggleDisabled}
            disabled={busy}
          />
        ) : (
          <GhostButton
            label={busy ? "Saving…" : "Disable account"}
            onPress={toggleDisabled}
            disabled={busy}
          />
        )
      ) : (
        <Text style={styles.muted}>
          Disabling an account needs an Admin account or higher — your tier can
          view this customer but not change their status.
        </Text>
      )}

      <Card>
        <Text style={styles.label}>Addresses</Text>
        {data.addresses.length === 0 ? (
          <EmptyBlock message="No saved addresses." />
        ) : (
          data.addresses.map((a) => (
            <Text key={a.id} style={{ fontSize: 14, lineHeight: 20 }}>
              <Text style={{ fontWeight: "700" }}>{a.label}: </Text>
              {a.line}
              {a.area ? `, ${a.area}` : ""}, {a.city} — {a.pincode}
            </Text>
          ))
        )}
      </Card>

      <Card>
        <Text style={styles.label}>Active vouchers</Text>
        {data.vouchers.length === 0 ? (
          <EmptyBlock message="No active vouchers issued to this customer's phone." />
        ) : (
          data.vouchers.map((v) => (
            <View key={v.id} style={styles.rowBetween}>
              <Text style={{ fontWeight: "700" }}>{v.code}</Text>
              <Text style={styles.muted}>
                {v.kind === "prepaid_card" && v.balancePaise != null
                  ? `${formatPaise(v.balancePaise)} left`
                  : v.status.replaceAll("_", " ")}
                {v.validUntil ? ` · until ${formatDate(v.validUntil)}` : ""}
              </Text>
            </View>
          ))
        )}
      </Card>

      <Card>
        <Text style={styles.label}>Recent orders</Text>
        {data.orders.length === 0 ? (
          <EmptyBlock message="No orders yet." />
        ) : (
          data.orders.map((o) => (
            <View key={o.id} style={styles.rowBetween}>
              <View>
                <Text style={{ fontWeight: "700" }}>#{o.id.slice(0, 8)}</Text>
                <Text style={styles.muted}>
                  {formatDate(o.createdAt)} · {o.itemCount} item
                  {o.itemCount === 1 ? "" : "s"}
                </Text>
              </View>
              <View style={{ alignItems: "flex-end", gap: 4 }}>
                <Badge label={statusLabel(o.status)} tone="teal" />
                <Text style={{ fontWeight: "700" }}>{formatPaise(o.totalPaise)}</Text>
              </View>
            </View>
          ))
        )}
      </Card>
    </Screen>
  );
}
