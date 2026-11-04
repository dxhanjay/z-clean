import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Alert, Text, View } from "react-native";
import HandoverPanel from "../../components/HandoverPanel";
import {
  Badge,
  Card,
  ErrorBlock,
  GhostButton,
  LoadingBlock,
  PrimaryButton,
  Screen,
  Title,
  paymentBadgeTone,
  styles,
} from "../../components/ui";
import { ApiError, fetchAdminOrderDetail, patchAdminOrderStatus } from "../../lib/api";
import { formatPaise, formatWhen } from "../../lib/format";
import { nextStatuses, statusLabel } from "../../lib/order-flow";
import type { AdminOrderDetail } from "../../lib/types";

/**
 * Admin order detail — full order plus the actions the mobile admin
 * supports, reusing the web APIs unchanged:
 *   - the Phase 8 handover chain (Mobile Phase 2): complete the next
 *     point with OTP/QR verification via HandoverPanel,
 *   - move to a valid next status (only the moves
 *     src/lib/order-flow allows are offered; the server re-checks),
 *   - Mark COD collected on a cod_pending Pay-on-Delivery order.
 * The plain status actions coexist with handovers, exactly as on the
 * web. Finance actions arrive in Mobile Phase 3 — see "More admin
 * tools".
 */
export default function AdminOrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [order, setOrder] = useState<AdminOrderDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [handoverFeedback, setHandoverFeedback] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const fresh = await fetchAdminOrderDetail(id);
      setOrder(fresh);
      setError(null);
    } catch {
      setError("Could not load this order.");
    }
  }, [id]);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    fetchAdminOrderDetail(id)
      .then((fresh) => {
        if (!cancelled) setOrder(fresh);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load this order.");
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  async function runAction(body: { status?: string; codCollected?: boolean }, confirmText: string) {
    if (!id) return;
    Alert.alert("Confirm", confirmText, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Yes, do it",
        onPress: async () => {
          setBusy(true);
          setActionError(null);
          try {
            await patchAdminOrderStatus(id, body);
            await load();
          } catch (e) {
            setActionError(e instanceof ApiError ? e.message : "The action failed. Try again.");
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  }

  if (error) {
    return (
      <Screen>
        <ErrorBlock message={error} onRetry={() => void load()} />
      </Screen>
    );
  }
  if (!order) {
    return (
      <Screen>
        <LoadingBlock label="Loading order…" />
      </Screen>
    );
  }

  const allowed = nextStatuses(order.status);
  const canCollectCod = order.payment_method === "cod" && order.payment_status === "cod_pending";

  return (
    <Screen>
      <Title>
        {order.profiles?.name ?? "Customer"} — {formatPaise(order.total_paise)}
      </Title>
      <View style={styles.rowWrap}>
        <Badge label={statusLabel(order.status)} />
        <Badge label={order.payment_status.replaceAll("_", " ")} tone={paymentBadgeTone(order.payment_status)} />
        <Badge label={order.payment_method === "cod" ? "Pay on Delivery" : "Online"} tone="grey" />
        {order.delivery_type === "express" ? <Badge label="Express" tone="grey" /> : null}
      </View>

      <Card>
        <Text style={styles.label}>Customer & pickup</Text>
        <Text style={styles.muted}>
          {order.profiles?.name ?? "—"}
          {order.profiles?.phone ? ` · ${order.profiles.phone}` : ""}
        </Text>
        {order.addresses && (
          <Text style={styles.muted}>
            {order.addresses.line}, {order.addresses.area ?? ""}, {order.addresses.city} —{" "}
            {order.addresses.pincode}
          </Text>
        )}
        <Text style={styles.muted}>Pickup slot: {formatWhen(order.pickup_slot)}</Text>
        <Text style={styles.muted}>Placed: {formatWhen(order.created_at)}</Text>
      </Card>

      <Card>
        <Text style={styles.label}>Items ({order.item_count})</Text>
        {order.items.map((item, i) => (
          <View key={i} style={styles.totalRow}>
            <Text style={styles.totalLabel}>
              {item.itemName} × {item.qty}
            </Text>
            <Text style={styles.totalValue}>{formatPaise(item.lineTotalPaise)}</Text>
          </View>
        ))}
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Subtotal</Text>
          <Text style={styles.totalValue}>{formatPaise(order.subtotal_paise)}</Text>
        </View>
        {order.discount_paise > 0 && (
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Coupon discount</Text>
            <Text style={styles.totalValue}>−{formatPaise(order.discount_paise)}</Text>
          </View>
        )}
        {order.voucher_discount_paise > 0 && (
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Voucher discount ({order.voucher_code})</Text>
            <Text style={styles.totalValue}>−{formatPaise(order.voucher_discount_paise)}</Text>
          </View>
        )}
        {order.voucher_redeemed_paise > 0 && (
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Paid by gift card ({order.voucher_code})</Text>
            <Text style={styles.totalValue}>{formatPaise(order.voucher_redeemed_paise)}</Text>
          </View>
        )}
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Pickup & delivery</Text>
          <Text style={styles.totalValue}>
            {order.delivery_fee_paise === 0 ? "Free" : formatPaise(order.delivery_fee_paise)}
          </Text>
        </View>
        <View style={styles.totalRow}>
          <Text style={styles.grandLabel}>Total</Text>
          <Text style={styles.grandValue}>{formatPaise(order.total_paise)}</Text>
        </View>
      </Card>

      <HandoverPanel
        key={`${order.id}:${order.next_point?.id ?? "done"}:${order.status}:${order.handovers.length}`}
        order={order}
        onChanged={() => void load()}
        feedback={handoverFeedback}
        setFeedback={setHandoverFeedback}
      />

      <Card>
        <Text style={styles.label}>Actions</Text>
        {actionError ? <Text style={styles.errorText}>{actionError}</Text> : null}
        {allowed.length === 0 && !canCollectCod && (
          <Text style={styles.muted}>No further actions — this order is {statusLabel(order.status).toLowerCase()}.</Text>
        )}
        {allowed.map((s) => (
          <PrimaryButton
            key={s}
            label={`Move to “${statusLabel(s)}”`}
            disabled={busy}
            onPress={() =>
              void runAction({ status: s }, `Move this order to “${statusLabel(s)}”?`)
            }
          />
        ))}
        {canCollectCod && (
          <GhostButton
            label={`Mark COD collected (${formatPaise(order.total_paise - order.voucher_redeemed_paise)})`}
            disabled={busy}
            onPress={() =>
              void runAction({ codCollected: true }, "Record that the Pay-on-Delivery amount was collected in full?")
            }
          />
        )}
        <Text style={styles.muted}>
          The payments ledger and refunds are in the web admin for now — see More admin tools.
        </Text>
      </Card>

      {order.history.length > 0 && (
        <Card>
          <Text style={styles.label}>History</Text>
          {order.history.map((h, i) => (
            <Text key={i} style={styles.muted}>
              {statusLabel(h.status)} · {formatWhen(h.at)}
              {h.note ? ` — ${h.note}` : ""}
            </Text>
          ))}
        </Card>
      )}
    </Screen>
  );
}
