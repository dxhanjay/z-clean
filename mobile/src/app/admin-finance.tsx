import { router, useFocusEffect } from "expo-router";
import { useCallback, useState, type ReactNode } from "react";
import { Alert, FlatList, Pressable, RefreshControl, Text, View } from "react-native";
import { Field } from "../components/forms";
import {
  Badge,
  Card,
  EmptyBlock,
  ErrorBlock,
  GhostButton,
  PrimaryButton,
  Screen,
  SkeletonRows,
  Subtitle,
  Title,
  styles,
} from "../components/ui";
import {
  ApiError,
  closeDay,
  fetchClosings,
  fetchFinanceOverview,
  fetchOutstanding,
  fetchRefundQueue,
  patchRefund,
} from "../lib/api";
import { brand } from "../lib/config";
import { istToday, paymentMethodLabel, rupeesToPaise, shiftDate } from "../lib/finance";
import { formatPaise, prettyDate } from "../lib/format";
import type { CashClosing, FinanceOverview, OutstandingRow, RefundView } from "../lib/types";

/**
 * Finance home (Mobile Phase 3) — the web /admin/finance screen,
 * native: one IST day's money (collections split gateway vs desk),
 * the cash closing, outstanding balances and the refund queue.
 * Expenses live on their own screen (Admin — expenses).
 */
export default function AdminFinanceScreen() {
  const [date, setDate] = useState(istToday());
  const [overview, setOverview] = useState<FinanceOverview | null>(null);
  const [closings, setClosings] = useState<CashClosing[]>([]);
  const [outstanding, setOutstanding] = useState<OutstandingRow[]>([]);
  const [refunds, setRefunds] = useState<RefundView[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const [countedCash, setCountedCash] = useState("");
  const [closeNote, setCloseNote] = useState("");
  const [closeBusy, setCloseBusy] = useState(false);
  const [closeError, setCloseError] = useState<string | null>(null);
  const [refundBusy, setRefundBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [ov, clo, out, ref] = await Promise.all([
        fetchFinanceOverview(date),
        fetchClosings(),
        fetchOutstanding(),
        fetchRefundQueue(),
      ]);
      setOverview(ov);
      setClosings(clo);
      setOutstanding(out);
      setRefunds(ref);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load the finance data.");
    }
  }, [date]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  async function submitClose() {
    if (!overview) return;
    setCloseError(null);
    setFeedback(null);
    const counted = rupeesToPaise(countedCash);
    if (counted === null) {
      setCloseError("Enter the counted cash amount (₹0 is allowed).");
      return;
    }
    setCloseBusy(true);
    try {
      const json = await closeDay({
        date,
        countedCashPaise: counted,
        note: closeNote.trim() || undefined,
      });
      setFeedback(
        `Day closed — expected ${formatPaise(json.expectedCashPaise)}, counted ${formatPaise(json.countedCashPaise)}, difference ${formatPaise(json.differencePaise)}.`,
      );
      setCountedCash("");
      setCloseNote("");
      await load();
    } catch (e) {
      setCloseError(e instanceof ApiError ? e.message : "The day could not be closed.");
    } finally {
      setCloseBusy(false);
    }
  }

  async function refundAction(refund: RefundView, action: "approve" | "reject" | "process") {
    const run = async () => {
      setRefundBusy(true);
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
      } catch (e) {
        Alert.alert("Refund", e instanceof ApiError ? e.message : "The refund could not be updated.");
      } finally {
        setRefundBusy(false);
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

  if (error && !overview) {
    return (
      <Screen admin>
        <ErrorBlock message={error} onRetry={() => void load()} />
      </Screen>
    );
  }

  const outstandingTotal = outstanding.reduce((s, o) => s + o.outstandingPaise, 0);

  const header = (
    <>
      <Title>Finance</Title>
      <Subtitle>The day in money: collections, the cash closing, who still owes, and the refund queue.</Subtitle>
      {feedback ? (
        <Card>
          <Text style={{ color: "#15803d", fontWeight: "700", fontSize: 14 }}>{feedback}</Text>
        </Card>
      ) : null}
    </>
  );

  /* The screen is a set of section cards; the FlatList's items are
   * those sections (same order, same visuals), and the outstanding
   * balances — the one long list — are a FlatList inside their card. */
  const sections: { id: string; node: ReactNode }[] = [
    {
      id: "date",
      node: (
        <Card>
          <View style={styles.rowBetween}>
            <Pressable onPress={() => setDate((d) => shiftDate(d, -1))} style={styles.chip}>
              <Text style={styles.chipText}>‹ Prev day</Text>
            </Pressable>
            <View style={{ alignItems: "center" }}>
              <Text style={styles.label}>{prettyDate(date)}</Text>
              <Text style={styles.muted}>{date} (IST)</Text>
            </View>
            <Pressable onPress={() => setDate((d) => shiftDate(d, 1))} style={styles.chip}>
              <Text style={styles.chipText}>Next day ›</Text>
            </Pressable>
          </View>
          {date !== istToday() ? (
            <GhostButton label="Jump to today" onPress={() => setDate(istToday())} />
          ) : null}
        </Card>
      ),
    },
    {
      id: "summary",
      node: (
        <Card>
          <Text style={styles.label}>Day summary</Text>
          {!overview ? (
            <SkeletonRows count={3} />
          ) : (
            <>
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Collected</Text>
                <Text style={styles.totalValue}>{formatPaise(overview.totalCollectedPaise)}</Text>
              </View>
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Refunds processed ({overview.refundsProcessedCount})</Text>
                <Text style={styles.totalValue}>−{formatPaise(overview.refundsProcessedPaise)}</Text>
              </View>
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Net collected</Text>
                <Text style={styles.totalValue}>{formatPaise(overview.netCollectedPaise)}</Text>
              </View>
              <View style={styles.totalRow}>
                <Text style={styles.grandLabel}>Expected cash in drawer</Text>
                <Text style={styles.grandValue}>{formatPaise(overview.expectedCashPaise)}</Text>
              </View>
              {overview.collections.length === 0 ? (
                <Text style={styles.muted}>No collections recorded on this date yet.</Text>
              ) : (
                overview.collections.map((c) => (
                  <View key={c.method} style={styles.totalRow}>
                    <Text style={styles.totalLabel}>
                      {paymentMethodLabel(c.method)}
                      {c.gatewayPaise > 0 ? ` · online ${formatPaise(c.gatewayPaise)}` : ""}
                      {c.entriesPaise > 0 ? ` · desk ${formatPaise(c.entriesPaise)}` : ""}
                    </Text>
                    <Text style={styles.totalValue}>{formatPaise(c.totalPaise)}</Text>
                  </View>
                ))
              )}
              <Text style={styles.muted}>
                Expenses on this date: {formatPaise(overview.expensesTotalPaise)}. Expected cash counts
                ledger cash only — online and gift-card money never sits in the drawer.
              </Text>

              {overview.closing ? (
                <Text style={styles.muted}>
                  <Text style={{ fontWeight: "700", color: "#1f2937" }}>{overview.date} is closed.</Text>{" "}
                  Expected {formatPaise(overview.closing.expectedCashPaise)} · counted{" "}
                  {formatPaise(overview.closing.countedCashPaise)} · difference{" "}
                  {formatPaise(overview.closing.differencePaise)}
                  {overview.closing.closedByLabel ? ` · by ${overview.closing.closedByLabel}` : ""}
                  {overview.closing.note ? ` · ${overview.closing.note}` : ""}
                </Text>
              ) : (
                <>
                  <Field
                    label="Counted cash (₹)"
                    keyboardType="decimal-pad"
                    value={countedCash}
                    onChangeText={setCountedCash}
                    placeholder={(overview.expectedCashPaise / 100).toFixed(2)}
                  />
                  <Field label="Note (optional)" value={closeNote} onChangeText={setCloseNote} maxLength={500} />
                  {closeError ? <Text style={styles.errorText}>{closeError}</Text> : null}
                  <PrimaryButton label="Close the day" busy={closeBusy} onPress={() => void submitClose()} />
                </>
              )}
            </>
          )}
        </Card>
      ),
    },
    ...(closings.length > 0
      ? [
          {
            id: "closings",
            node: (
              <Card>
                <Text style={styles.label}>Closing history</Text>
                {closings.slice(0, 14).map((c) => (
                  <View key={c.id} style={styles.totalRow}>
                    <Text style={styles.totalLabel}>
                      {c.date} · exp {formatPaise(c.expectedCashPaise)} · counted {formatPaise(c.countedCashPaise)}
                      {c.closedByLabel ? ` · ${c.closedByLabel}` : ""}
                    </Text>
                    <Text
                      style={[
                        styles.totalValue,
                        { color: c.differencePaise === 0 ? "#15803d" : "#92400e" },
                      ]}
                    >
                      {formatPaise(c.differencePaise)}
                    </Text>
                  </View>
                ))}
              </Card>
            ),
          },
        ]
      : []),
    {
      id: "outstanding",
      node: (
        <Card>
          <Text style={styles.label}>
            Outstanding balances ({outstanding.length} · {formatPaise(outstandingTotal)})
          </Text>
          {outstanding.length === 0 ? (
            <EmptyBlock message="Nothing outstanding — every non-cancelled order is settled." />
          ) : (
            <FlatList
              data={outstanding}
              keyExtractor={(o) => o.orderId}
              scrollEnabled={false}
              initialNumToRender={10}
              windowSize={11}
              removeClippedSubviews
              renderItem={({ item: o }) => (
                <Pressable
                  onPress={() => router.push(`/admin-order/${o.orderId}`)}
                  style={{ gap: 2, paddingVertical: 6 }}
                >
                  <View style={styles.rowBetween}>
                    <Text style={{ fontWeight: "700", fontSize: 14 }}>{o.customer}</Text>
                    <Text style={{ fontWeight: "800", color: "#92400e" }}>{formatPaise(o.outstandingPaise)}</Text>
                  </View>
                  <Text style={styles.muted}>
                    {o.area ?? ""}
                    {o.phone ? ` · ${o.phone}` : ""} · {o.status.replaceAll("_", " ")} · total{" "}
                    {formatPaise(o.totalPaise)} · paid {formatPaise(o.paidPaise)} · {o.ageDays}d old
                  </Text>
                </Pressable>
              )}
            />
          )}
        </Card>
      ),
    },
    {
      id: "refunds",
      node: (
        <Card>
          <Text style={styles.label}>Refund queue</Text>
          {refunds.length === 0 ? (
            <EmptyBlock message="No refunds are waiting. Requests are created on the page of an order." />
          ) : (
            refunds.map((r) => (
              <View key={r.id} style={{ gap: 4, paddingVertical: 6 }}>
                <View style={styles.rowBetween}>
                  <Text style={{ fontWeight: "700", fontSize: 14 }}>
                    {formatPaise(r.amountPaise)} · {paymentMethodLabel(r.method)}
                  </Text>
                  <Badge label={r.status} tone={r.status === "approved" ? "amber" : "teal"} />
                </View>
                {r.customer ? (
                  <Text style={styles.muted}>
                    {r.customer}
                    {r.orderTotalPaise ? ` · order total ${formatPaise(r.orderTotalPaise)}` : ""}
                  </Text>
                ) : null}
                <Text style={styles.muted}>{r.reason}</Text>
                <Text style={styles.muted}>
                  Requested {new Date(r.createdAt).toLocaleString("en-IN")}
                  {r.requestedByLabel ? ` by ${r.requestedByLabel}` : ""}
                </Text>
                <View style={styles.rowWrap}>
                  {r.status === "requested" ? (
                    <>
                      <GhostButton label="Approve" disabled={refundBusy} onPress={() => void refundAction(r, "approve")} />
                      <GhostButton label="Reject" disabled={refundBusy} onPress={() => void refundAction(r, "reject")} />
                    </>
                  ) : null}
                  {r.status === "approved" ? (
                    <PrimaryButton
                      label="Process — money returned"
                      disabled={refundBusy}
                      onPress={() => void refundAction(r, "process")}
                    />
                  ) : null}
                  <GhostButton label="Open order" onPress={() => router.push(`/admin-order/${r.orderId}`)} />
                </View>
              </View>
            ))
          )}
        </Card>
      ),
    },
  ];

  return (
    <Screen scroll={false} admin>
      <FlatList
        data={sections}
        keyExtractor={(s) => s.id}
        renderItem={({ item }) => item.node}
        ListHeaderComponent={header}
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
