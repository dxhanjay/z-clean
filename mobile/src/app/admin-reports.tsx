import { router, useFocusEffect } from "expo-router";
import { useCallback, useState, type ReactNode } from "react";
import { FlatList, Pressable, RefreshControl, Text, View } from "react-native";
import {
  Card,
  Chip,
  EmptyBlock,
  ErrorBlock,
  LoadingBlock,
  Screen,
  Subtitle,
  Title,
  styles,
} from "../components/ui";
import { ApiError, fetchReports } from "../lib/api";
import { brand } from "../lib/config";
import { EXPENSE_CATEGORY_LABELS } from "../lib/finance";
import { formatPaise } from "../lib/format";
import type { KeyValueTotal, ReportsData } from "../lib/types";

/** CSS-bar equivalent for React Native (web AdminReports Bar). */
function Bar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
  return (
    <View style={{ height: 9, borderRadius: 999, backgroundColor: brand.tealSoft, overflow: "hidden" }}>
      <View style={{ height: "100%", width: `${pct}%`, borderRadius: 999, backgroundColor: brand.teal }} />
    </View>
  );
}

function BarSection({
  title,
  rows,
  empty,
  note,
}: {
  title: string;
  rows: KeyValueTotal[];
  empty: string;
  note?: string;
}) {
  const max = Math.max(0, ...rows.map((r) => r.grossPaise));
  return (
    <Card>
      <Text style={styles.label}>{title}</Text>
      {rows.length === 0 ? (
        <EmptyBlock message={empty} />
      ) : (
        rows.map((r) => (
          <View key={r.key} style={{ gap: 4 }}>
            <View style={styles.rowBetween}>
              <Text style={{ fontWeight: "700", fontSize: 14 }}>{r.label}</Text>
              <Text style={styles.muted}>
                {formatPaise(r.grossPaise)} · {r.orders} order{r.orders === 1 ? "" : "s"}
              </Text>
            </View>
            <Bar value={r.grossPaise} max={max} />
          </View>
        ))
      )}
      {note ? <Text style={styles.muted}>{note}</Text> : null}
    </Card>
  );
}

function KvRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.totalRow}>
      <Text style={styles.totalLabel}>{label}</Text>
      <Text style={styles.totalValue}>{value}</Text>
    </View>
  );
}

/**
 * Reports & analytics (Mobile Phase 3) — the web /admin/reports
 * screen, native. Every number comes from GET /api/admin/reports;
 * sections with no underlying data say so instead of showing
 * invented numbers.
 */
export default function AdminReportsScreen() {
  const [days, setDays] = useState(30);
  const [reports, setReports] = useState<ReportsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setReports(await fetchReports(days));
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load the reports.");
    }
  }, [days]);

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

  if (error && !reports) {
    return (
      <Screen>
        <ErrorBlock message={error} onRetry={() => void load()} />
      </Screen>
    );
  }
  if (!reports) {
    return (
      <Screen>
        <LoadingBlock label="Loading reports…" />
      </Screen>
    );
  }

  const r = reports;
  const maxDay = Math.max(0, ...r.salesByDay.map((d) => d.grossPaise));
  const agingEmpty = r.pendingAging.every((b) => b.count === 0);

  const header = (
    <>
      <Title>Reports & analytics</Title>
      <Subtitle>Computed live from orders, handovers, vouchers and the money ledger.</Subtitle>

      <View style={styles.rowWrap}>
        {[7, 30, 90].map((d) => (
          <Chip key={d} label={`Last ${d} days`} selected={days === d} onPress={() => setDays(d)} />
        ))}
      </View>
    </>
  );

  /* One ScrollView of heterogeneous section cards → a FlatList whose
   * items are the section blocks, in the same order with the same
   * visuals; title/subtitle/period chips ride in the header. */
  const sections: { id: string; node: ReactNode }[] = [
    {
      id: "summary",
      node: (
        <Card>
          <KvRow label="Gross sales" value={formatPaise(r.salesVsExpense.grossPaise)} />
          <KvRow label="Collected" value={formatPaise(r.salesVsExpense.collectedPaise)} />
          <KvRow label="Expenses" value={formatPaise(r.salesVsExpense.expensesPaise)} />
          <View style={styles.totalRow}>
            <Text style={styles.grandLabel}>Net (collected − expenses)</Text>
            <Text style={styles.grandValue}>{formatPaise(r.salesVsExpense.netPaise)}</Text>
          </View>
        </Card>
      ),
    },
    {
      id: "salesByDay",
      node: (
        <Card>
          <Text style={styles.label}>Sales by day</Text>
          {r.salesByDay.length === 0 ? (
            <EmptyBlock message="No orders in this period yet." />
          ) : (
            r.salesByDay.map((d) => (
              <View key={d.date} style={{ gap: 4 }}>
                <View style={styles.rowBetween}>
                  <Text style={{ fontWeight: "700", fontSize: 14 }}>{d.date.slice(5)}</Text>
                  <Text style={styles.muted}>
                    {formatPaise(d.grossPaise)} · {d.orders} order{d.orders === 1 ? "" : "s"} · collected{" "}
                    {formatPaise(d.collectedPaise)}
                  </Text>
                </View>
                <Bar value={d.grossPaise} max={maxDay} />
              </View>
            ))
          )}
        </Card>
      ),
    },
    {
      id: "salesByService",
      node: <BarSection title="Sales by service" rows={r.salesByService} empty="No item revenue in this period yet." />,
    },
    {
      id: "salesByArea",
      node: <BarSection title="Sales by area" rows={r.salesByArea} empty="No orders in this period yet." />,
    },
    {
      id: "processedByPlant",
      node: (
        <BarSection
          title="Processed by plant"
          rows={r.processedByPlant}
          empty="No orders in this period yet."
          note="A plant is credited when its plant manager receives the order at the centre-to-plant handover; orders without that handover show as Unassigned."
        />
      ),
    },
    {
      id: "pendingAging",
      node: (
        <Card>
          <Text style={styles.label}>Pending orders — aging</Text>
          {agingEmpty ? (
            <EmptyBlock message="No orders are waiting right now." />
          ) : (
            r.pendingAging.map((b) => (
              <View key={b.bucket} style={{ gap: 3, paddingVertical: 4 }}>
                <View style={styles.rowBetween}>
                  <Text style={{ fontWeight: "700", fontSize: 14 }}>{b.bucket}</Text>
                  <Text style={styles.grandValue}>{b.count}</Text>
                </View>
                {b.orders.slice(0, 4).map((o) => (
                  <Pressable key={o.id} onPress={() => router.push(`/admin-order/${o.id}`)}>
                    <Text style={styles.muted}>
                      {o.id.length > 14 ? `${o.id.slice(0, 8).toUpperCase()}…` : o.id} ·{" "}
                      {o.status.replaceAll("_", " ")} · {formatPaise(o.totalPaise)}
                    </Text>
                  </Pressable>
                ))}
                {b.orders.length > 4 ? <Text style={styles.muted}>+{b.orders.length - 4} more</Text> : null}
              </View>
            ))
          )}
        </Card>
      ),
    },
    {
      id: "employeePerformance",
      node: (
        <Card>
          <Text style={styles.label}>Employee performance (handovers)</Text>
          {r.employeePerformance.length === 0 ? (
            <EmptyBlock message="No handovers recorded in this period yet." />
          ) : (
            r.employeePerformance.map((e) => (
              <View key={e.employeeId} style={styles.totalRow}>
                <Text style={styles.totalLabel}>{e.name}</Text>
                <Text style={styles.totalValue}>
                  {e.handovers} handovers · {e.deliveries} deliveries · {e.flagsRaised} flags
                </Text>
              </View>
            ))
          )}
        </Card>
      ),
    },
    {
      id: "voucherUsage",
      node: (
        <Card>
          <Text style={styles.label}>Voucher usage</Text>
          {r.voucherUsage.created === 0 ? (
            <EmptyBlock message="No vouchers have been created yet." />
          ) : (
            <>
              <KvRow label="Vouchers created" value={String(r.voucherUsage.created)} />
              <KvRow label="Issued (incl. redeemed)" value={String(r.voucherUsage.issued)} />
              <KvRow label="Redeemed (partly or fully)" value={String(r.voucherUsage.redeemed)} />
              <KvRow
                label="Gift-card liability outstanding"
                value={formatPaise(r.voucherUsage.outstandingLiabilityPaise)}
              />
              <KvRow label="Promo discount given (period)" value={formatPaise(r.voucherUsage.discountGivenPaise)} />
              <KvRow
                label="Gift-card value redeemed (period)"
                value={formatPaise(r.voucherUsage.redeemedValuePaise)}
              />
            </>
          )}
        </Card>
      ),
    },
    {
      id: "retention",
      node: (
        <Card>
          <Text style={styles.label}>Customers & retention</Text>
          {r.retention.customers === 0 ? (
            <EmptyBlock message="No customers yet." />
          ) : (
            <>
              <KvRow label="Customers (all time)" value={String(r.retention.customers)} />
              <KvRow label="Repeat customers" value={String(r.retention.repeatCustomers)} />
              <KvRow label="Repeat rate" value={`${r.retention.repeatRatePercent}%`} />
              {r.retention.topCustomers.length > 0 ? (
                <>
                  <Text style={styles.label}>Top customers</Text>
                  {r.retention.topCustomers.map((c, idx) => (
                    <View key={idx} style={styles.totalRow}>
                      <Text style={styles.totalLabel}>{c.label}</Text>
                      <Text style={styles.totalValue}>
                        {c.orders} order{c.orders === 1 ? "" : "s"} · {formatPaise(c.grossPaise)}
                      </Text>
                    </View>
                  ))}
                </>
              ) : null}
            </>
          )}
        </Card>
      ),
    },
    {
      id: "expensesByCategory",
      node: (
        <Card>
          <Text style={styles.label}>Expenses by category</Text>
          {r.expensesByCategory.length === 0 ? (
            <EmptyBlock message="No expenses recorded in this period yet." />
          ) : (
            r.expensesByCategory.map((e) => (
              <View key={e.category} style={styles.totalRow}>
                <Text style={styles.totalLabel}>{EXPENSE_CATEGORY_LABELS[e.category] ?? e.category}</Text>
                <Text style={styles.totalValue}>{formatPaise(e.totalPaise)}</Text>
              </View>
            ))
          )}
        </Card>
      ),
    },
  ];

  return (
    <Screen scroll={false}>
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
