import * as Linking from "expo-linking";
import { useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import QRCode from "react-native-qrcode-svg";
import SupportCard from "../../components/SupportCard";
import {
  Badge,
  Card,
  ErrorBlock,
  GhostButton,
  LoadingBlock,
  Screen,
  Title,
  paymentBadgeTone,
  styles,
} from "../../components/ui";
import { fetchOrderDetail } from "../../lib/api";
import { API_BASE_URL, brand } from "../../lib/config";
import { formatPaise, formatWhen } from "../../lib/format";
import { ORDER_STEPS, statusLabel, stepIndex } from "../../lib/order-flow";
import type { CustomerOrderDetail } from "../../lib/types";

/**
 * Order detail (customer) — the mobile twin of the web tracking
 * page: status timeline from the order's history, items and totals,
 * the money breakdown (Phase 9 finance block), handover milestones,
 * and the Phase 8 credentials — the order QR plus the pickup /
 * delivery OTPs (the server returns each OTP only until it is used,
 * and only to the owner).
 */
export default function OrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [order, setOrder] = useState<CustomerOrderDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    fetchOrderDetail(id)
      .then((o) => {
        if (!cancelled) {
          setOrder(o);
          setError(null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError("Could not load this order. It may belong to a different account, or the connection dropped.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [id, reloadKey]);

  if (error) {
    return (
      <Screen>
        <ErrorBlock message={error} onRetry={() => setReloadKey((k) => k + 1)} />
      </Screen>
    );
  }
  if (!order) {
    return (
      <Screen>
        <LoadingBlock label="Loading your order…" />
      </Screen>
    );
  }

  const currentStep = stepIndex(order.status);
  const historyByStatus = new Map(order.history.map((h) => [h.status, h]));
  const outstanding = order.finance?.outstandingPaise ?? Math.max(0, order.total_paise - order.voucher_redeemed_paise);

  return (
    <Screen>
      <Title>Order {order.id.slice(0, 8).toUpperCase()}…</Title>
      <View style={styles.rowWrap}>
        <Badge label={statusLabel(order.status)} />
        <Badge label={order.payment_status.replaceAll("_", " ")} tone={paymentBadgeTone(order.payment_status)} />
        {order.delivery_type === "express" ? <Badge label="Express" tone="grey" /> : null}
      </View>

      <Card>
        <Text style={styles.label}>Tracking</Text>
        {currentStep >= 0 ? (
          ORDER_STEPS.map((step, idx) => {
            const done = idx <= currentStep;
            const h = historyByStatus.get(step.status);
            return (
              <View key={step.status} style={{ flexDirection: "row", gap: 10, paddingVertical: 4 }}>
                <Text style={{ fontSize: 15, color: done ? brand.teal : "#d1d5db", fontWeight: "800" }}>
                  {done ? "●" : "○"}
                </Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: done ? "700" : "500", color: done ? brand.ink : brand.inkSoft }}>
                    {step.label}
                    {h ? ` · ${formatWhen(h.at)}` : ""}
                  </Text>
                  {idx === currentStep && <Text style={styles.muted}>{step.hint}</Text>}
                  {h?.note ? <Text style={styles.muted}>{h.note}</Text> : null}
                </View>
              </View>
            );
          })
        ) : (
          <Text style={styles.muted}>
            This order is {statusLabel(order.status).toLowerCase()} and is not on the delivery
            timeline.
          </Text>
        )}
        {order.handover_milestones.length > 0 && (
          <>
            <Text style={[styles.label, { marginTop: 6 }]}>Handover record</Text>
            {order.handover_milestones.map((m, i) => (
              <Text key={i} style={styles.muted}>
                ✓ {m.label} — {formatWhen(m.at)} ({m.method === "otp" ? "OTP verified" : "QR verified"}, qty {m.quantity})
              </Text>
            ))}
          </>
        )}
      </Card>

      {(order.qr_payload || order.pickup_otp || order.delivery_otp) && (
        <Card style={{ alignItems: "center" }}>
          <Text style={styles.label}>Show this at pickup & delivery</Text>
          {order.qr_payload && (
            <QRCode value={order.qr_payload} size={168} color={brand.tealDarker} backgroundColor="#ffffff" />
          )}
          {order.pickup_otp && (
            <Text style={{ fontSize: 15 }}>
              Pickup OTP: <Text style={{ fontWeight: "800", letterSpacing: 2 }}>{order.pickup_otp}</Text>
            </Text>
          )}
          {order.delivery_otp && (
            <Text style={{ fontSize: 15 }}>
              Delivery OTP: <Text style={{ fontWeight: "800", letterSpacing: 2 }}>{order.delivery_otp}</Text>
            </Text>
          )}
          <Text style={styles.muted}>
            Our rider verifies the QR or OTP when collecting and returning your laundry. Each OTP
            disappears once it has been used.
          </Text>
        </Card>
      )}

      <Card>
        <Text style={styles.label}>Items</Text>
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
            <Text style={[styles.totalLabel, { color: brand.green }]}>Coupon discount</Text>
            <Text style={[styles.totalValue, { color: brand.green }]}>−{formatPaise(order.discount_paise)}</Text>
          </View>
        )}
        {order.voucher_discount_paise > 0 && (
          <View style={styles.totalRow}>
            <Text style={[styles.totalLabel, { color: brand.green }]}>
              Voucher discount{order.voucher_code ? ` (${order.voucher_code})` : ""}
            </Text>
            <Text style={[styles.totalValue, { color: brand.green }]}>−{formatPaise(order.voucher_discount_paise)}</Text>
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
        {order.finance && order.finance.payments.length > 0 && (
          <>
            <Text style={[styles.label, { marginTop: 6 }]}>Payments received</Text>
            {order.finance.payments.map((p, i) => (
              <View key={i} style={styles.totalRow}>
                <Text style={styles.totalLabel}>
                  {p.label} · {formatWhen(p.at)}
                </Text>
                <Text style={styles.totalValue}>{formatPaise(p.amountPaise)}</Text>
              </View>
            ))}
            {order.finance.refunds.map((r, i) => (
              <View key={`r${i}`} style={styles.totalRow}>
                <Text style={styles.totalLabel}>
                  {r.label} · {formatWhen(r.at)}
                </Text>
                <Text style={styles.totalValue}>−{formatPaise(r.amountPaise)}</Text>
              </View>
            ))}
          </>
        )}
        {outstanding > 0 && order.payment_status !== "paid" ? (
          <Text style={{ color: brand.amber, fontWeight: "700" }}>
            Balance to pay: {formatPaise(outstanding)}
            {order.payment_method === "cod" ? " — please keep it ready at delivery." : ""}
          </Text>
        ) : order.payment_status === "paid" ? (
          <Text style={{ color: brand.green, fontWeight: "700" }}>Paid in full ✓</Text>
        ) : null}
      </Card>

      <Card>
        <Text style={styles.label}>Pickup</Text>
        <Text style={styles.muted}>When: {formatWhen(order.pickup_slot)}</Text>
        {order.addresses && (
          <Text style={styles.muted}>
            Where: {order.addresses.line}, {order.addresses.area ?? ""}, {order.addresses.city} —{" "}
            {order.addresses.pincode}
          </Text>
        )}
        <Text style={styles.muted}>Placed: {formatWhen(order.created_at)}</Text>
      </Card>

      <Card>
        <Text style={styles.label}>Receipt</Text>
        <Text style={styles.muted}>
          Opens the printable web receipt for this order in your browser.
        </Text>
        <GhostButton
          label="Open receipt"
          onPress={() => void Linking.openURL(`${API_BASE_URL}/orders/${order.id}/receipt`)}
        />
      </Card>

      <SupportCard orderRef={order.id.slice(0, 8).toUpperCase()} />
    </Screen>
  );
}
