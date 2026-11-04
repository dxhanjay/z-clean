import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Alert, Text, View } from "react-native";
import { Field, SelectChips } from "./forms";
import { Badge, Card, GhostButton, PrimaryButton, styles } from "./ui";
import {
  ApiError,
  fetchOrderPayments,
  patchRefund,
  recordPayment,
  requestRefund,
} from "../lib/api";
import {
  paymentMethodLabel,
  RECORDABLE_METHODS,
  REFUND_METHODS,
  rupeesToPaise,
} from "../lib/finance";
import { formatPaise, formatWhen } from "../lib/format";
import { successTap } from "../lib/haptics";
import type { OrderPaymentsView, RefundView } from "../lib/types";

/**
 * Payments & refunds panel for the admin order screen
 * (Mobile Phase 3) — mirrors web AdminOrderPayments: the one
 * finance computation for the order (gateway + staff ledger +
 * legacy rule), record a payment against the outstanding balance,
 * and the refund workflow request → approve/reject → process.
 * Processing is the only step that moves money.
 */
export default function OrderPaymentsPanel({
  orderId,
  onChanged,
}: {
  orderId: string;
  onChanged: () => void;
}) {
  const [view, setView] = useState<OrderPaymentsView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const [payMethod, setPayMethod] = useState<string>("cash");
  const [payAmount, setPayAmount] = useState("");
  const [payReference, setPayReference] = useState("");
  const [payNote, setPayNote] = useState("");
  const [payBusy, setPayBusy] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);

  const [refundAmount, setRefundAmount] = useState("");
  const [refundMethod, setRefundMethod] = useState<string>("original_payment");
  const [refundReason, setRefundReason] = useState("");
  const [refundBusy, setRefundBusy] = useState(false);
  const [refundError, setRefundError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setView(await fetchOrderPayments(orderId));
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof ApiError ? e.message : "Could not load the payment details.");
    }
  }, [orderId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function submitPayment() {
    if (!view) return;
    setPayError(null);
    setFeedback(null);
    const amountPaise = rupeesToPaise(payAmount);
    if (amountPaise === null || amountPaise <= 0) {
      setPayError("Enter an amount above zero.");
      return;
    }
    setPayBusy(true);
    try {
      // The server enforces the cap too — OVERPAYMENT /
      // NOTHING_OUTSTANDING come back verbatim in ApiError.message.
      await recordPayment(orderId, {
        method: payMethod,
        amountPaise,
        reference: payReference.trim() || undefined,
        note: payNote.trim() || undefined,
      });
      successTap();
      setFeedback("Payment recorded.");
      setPayAmount("");
      setPayReference("");
      setPayNote("");
      await load();
      onChanged();
    } catch (e) {
      setPayError(e instanceof ApiError ? e.message : "The payment could not be recorded.");
    } finally {
      setPayBusy(false);
    }
  }

  async function submitRefundRequest() {
    if (!view) return;
    setRefundError(null);
    setFeedback(null);
    const amountPaise = rupeesToPaise(refundAmount);
    if (amountPaise === null || amountPaise <= 0) {
      setRefundError("Enter an amount above zero.");
      return;
    }
    if (refundReason.trim().length < 3) {
      setRefundError("Give a short reason for the refund.");
      return;
    }
    setRefundBusy(true);
    try {
      await requestRefund(orderId, {
        amountPaise,
        reason: refundReason.trim(),
        method: refundMethod,
      });
      setFeedback("Refund requested. It now needs approval before it can be processed.");
      setRefundAmount("");
      setRefundReason("");
      await load();
      onChanged();
    } catch (e) {
      setRefundError(e instanceof ApiError ? e.message : "The refund request could not be created.");
    } finally {
      setRefundBusy(false);
    }
  }

  async function refundAction(refund: RefundView, action: "approve" | "reject" | "process") {
    const run = async () => {
      setActionBusy(true);
      setFeedback(null);
      try {
        await patchRefund(refund.id, action);
        setFeedback(
          action === "process"
            ? "Refund processed — the money has been handed back in the ledger."
            : action === "approve"
              ? "Refund approved."
              : "Refund rejected.",
        );
        await load();
        onChanged();
      } catch (e) {
        Alert.alert("Refund", e instanceof ApiError ? e.message : "The refund could not be updated.");
      } finally {
        setActionBusy(false);
      }
    };
    if (action === "process") {
      Alert.alert(
        "Process this refund?",
        `Processing hands ${formatPaise(refund.amountPaise)} back to the customer (${paymentMethodLabel(refund.method)}) and writes it into the money ledger. This cannot be undone.`,
        [
          { text: "Cancel", style: "cancel" },
          { text: "Process refund", style: "destructive", onPress: () => void run() },
        ],
      );
    } else {
      await run();
    }
  }

  if (loadError) {
    return (
      <Card>
        <Text style={styles.label}>Payments & refunds</Text>
        <Text style={styles.errorText}>{loadError}</Text>
        <GhostButton label="Try again" onPress={() => void load()} />
      </Card>
    );
  }
  if (!view) {
    return (
      <Card>
        <Text style={styles.label}>Payments & refunds</Text>
        <Text style={styles.muted}>Loading the money…</Text>
      </Card>
    );
  }

  const f = view.finance;

  return (
    <Card>
      <Text style={styles.label}>Payments & refunds</Text>
      {feedback ? (
        <Text style={{ color: "#15803d", fontWeight: "700", fontSize: 14 }}>{feedback}</Text>
      ) : null}

      <View style={styles.totalRow}>
        <Text style={styles.totalLabel}>Order total</Text>
        <Text style={styles.totalValue}>{formatPaise(f.totalPaise)}</Text>
      </View>
      <View style={styles.totalRow}>
        <Text style={styles.totalLabel}>Paid online / gift card</Text>
        <Text style={styles.totalValue}>{formatPaise(f.gatewayPaidPaise)}</Text>
      </View>
      <View style={styles.totalRow}>
        <Text style={styles.totalLabel}>Paid at the desk (ledger)</Text>
        <Text style={styles.totalValue}>{formatPaise(f.entriesPaidPaise)}</Text>
      </View>
      <View style={styles.totalRow}>
        <Text style={styles.totalLabel}>Effective paid</Text>
        <Text style={styles.totalValue}>{formatPaise(f.effectivePaidPaise)}</Text>
      </View>
      {f.legacySettled ? (
        <Text style={styles.muted}>
          Settled under the pre-ledger rule: this order was marked paid before the money ledger
          existed, so it counts as paid in full.
        </Text>
      ) : null}
      <View style={styles.totalRow}>
        <Text style={styles.grandLabel}>Outstanding</Text>
        <Text style={styles.grandValue}>{formatPaise(f.outstandingPaise)}</Text>
      </View>
      <View style={styles.totalRow}>
        <Text style={styles.totalLabel}>Refunds handed back</Text>
        <Text style={styles.totalValue}>{formatPaise(f.refundsProcessedPaise)}</Text>
      </View>
      <View style={styles.totalRow}>
        <Text style={styles.totalLabel}>Still refundable</Text>
        <Text style={styles.totalValue}>{formatPaise(f.refundablePaise)}</Text>
      </View>

      {view.gatewayPayments.length > 0 ? (
        <>
          <Text style={styles.label}>Online / gateway payments</Text>
          {view.gatewayPayments.map((p) => (
            <Text key={p.id} style={styles.muted}>
              {paymentMethodLabel(p.gateway)} · {formatPaise(p.amountPaise)} · {p.status} ·{" "}
              {formatWhen(p.createdAt)}
            </Text>
          ))}
        </>
      ) : null}

      {view.entries.length > 0 ? (
        <>
          <Text style={styles.label}>Ledger entries</Text>
          {view.entries.map((e) => (
            <Text key={e.id} style={styles.muted}>
              {e.entryType === "refund" ? "Refund" : "Payment"} · {paymentMethodLabel(e.method)} ·{" "}
              {e.entryType === "refund" ? "−" : "+"}
              {formatPaise(e.amountPaise)} · {formatWhen(e.createdAt)}
              {e.reference ? ` · ref ${e.reference}` : ""}
              {e.recordedByEmployeeName ? ` · taken by ${e.recordedByEmployeeName}` : ""}
              {e.note ? ` · ${e.note}` : ""}
            </Text>
          ))}
        </>
      ) : null}

      {view.orderStatus !== "CANCELLED" && f.outstandingPaise > 0 ? (
        <>
          <Text style={styles.label}>Record a payment</Text>
          <SelectChips
            label="Method"
            options={RECORDABLE_METHODS.map((m) => ({ value: m, label: paymentMethodLabel(m) }))}
            value={payMethod}
            onChange={(v) => v && setPayMethod(v)}
          />
          <Field
            label={`Amount (₹) — ${formatPaise(f.outstandingPaise)} outstanding`}
            keyboardType="decimal-pad"
            value={payAmount}
            onChangeText={setPayAmount}
            placeholder="0.00"
          />
          <Field
            label="Reference (optional)"
            value={payReference}
            onChangeText={setPayReference}
            maxLength={120}
            placeholder="UPI ref / txn id"
          />
          <Field label="Note (optional)" value={payNote} onChangeText={setPayNote} maxLength={300} />
          {payError ? <Text style={styles.errorText}>{payError}</Text> : null}
          <PrimaryButton label="Record payment" busy={payBusy} onPress={() => void submitPayment()} />
        </>
      ) : null}

      {f.refundablePaise > 0 ? (
        <>
          <Text style={styles.label}>Request a refund</Text>
          <Field
            label={`Amount (₹) — ${formatPaise(f.refundablePaise)} refundable`}
            keyboardType="decimal-pad"
            value={refundAmount}
            onChangeText={setRefundAmount}
            placeholder="0.00"
          />
          <SelectChips
            label="Refund by"
            options={REFUND_METHODS.map((m) => ({ value: m, label: paymentMethodLabel(m) }))}
            value={refundMethod}
            onChange={(v) => v && setRefundMethod(v)}
          />
          <Field
            label="Reason"
            value={refundReason}
            onChangeText={setRefundReason}
            maxLength={500}
            placeholder="Why is money going back?"
          />
          {refundError ? <Text style={styles.errorText}>{refundError}</Text> : null}
          <PrimaryButton label="Request refund" busy={refundBusy} onPress={() => void submitRefundRequest()} />
        </>
      ) : null}

      {view.refunds.length > 0 ? (
        <>
          <Text style={styles.label}>Refunds on this order</Text>
          {view.refunds.map((r) => (
            <View key={r.id} style={{ gap: 3, paddingVertical: 5 }}>
              <View style={styles.rowBetween}>
                <Text style={{ fontWeight: "700", fontSize: 14 }}>
                  {formatPaise(r.amountPaise)} · {paymentMethodLabel(r.method)}
                </Text>
                <Badge
                  label={r.status}
                  tone={r.status === "processed" ? "green" : r.status === "rejected" ? "red" : "amber"}
                />
              </View>
              <Text style={styles.muted}>
                {r.reason} · requested {formatWhen(r.createdAt)}
                {r.requestedByLabel ? ` by ${r.requestedByLabel}` : ""}
                {r.decidedByLabel ? ` · decided by ${r.decidedByLabel}` : ""}
                {r.processedAt ? ` · processed ${formatWhen(r.processedAt)}` : ""}
              </Text>
              <View style={styles.rowWrap}>
                {r.status === "requested" ? (
                  <>
                    <GhostButton label="Approve" disabled={actionBusy} onPress={() => void refundAction(r, "approve")} />
                    <GhostButton label="Reject" disabled={actionBusy} onPress={() => void refundAction(r, "reject")} />
                  </>
                ) : null}
                {r.status === "approved" ? (
                  <PrimaryButton
                    label="Process — money returned"
                    disabled={actionBusy}
                    onPress={() => void refundAction(r, "process")}
                  />
                ) : null}
              </View>
            </View>
          ))}
        </>
      ) : null}
    </Card>
  );
}
