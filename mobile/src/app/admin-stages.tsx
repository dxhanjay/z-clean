import { router, useFocusEffect } from "expo-router";
import { memo, useCallback, useMemo, useState } from "react";
import { FlatList, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import {
  Badge,
  Card,
  EmptyBlock,
  ErrorBlock,
  Screen,
  SkeletonRows,
  Title,
  styles,
} from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { fetchEmployees, fetchStages } from "../lib/api";
import { brand } from "../lib/config";
import { formatWhen } from "../lib/format";
import { staffRoleLabel } from "../lib/org";
import { statusLabel } from "../lib/order-flow";
import type { Employee, StageQueue, StagesResult } from "../lib/types";

/**
 * Stage queues (Mobile Phase 2) — GET /api/admin/stages?employeeId=.
 *
 * Pick an active employee; the server returns the handover points
 * they can RECEIVE at (their roles against the Phase 8 chain) and the
 * orders awaiting each point, oldest first. Tapping an order opens
 * its admin detail, where the handover is completed. "Awaiting" is
 * derived server-side from status + recorded handovers — there is no
 * client-side chain state to drift.
 */

const QueueCard = memo(function QueueCard({
  queue: q,
  onOpenOrder,
}: {
  queue: StageQueue;
  onOpenOrder: (id: string) => void;
}) {
  return (
    <Card>
      <View style={styles.rowBetween}>
        <Text style={[styles.label, { flex: 1 }]}>{q.label}</Text>
        <Badge label={`${q.count} waiting`} tone={q.count > 0 ? "amber" : "grey"} />
      </View>
      <Text style={styles.muted}>
        Verified by {q.method === "otp" ? "customer OTP" : "order QR"} · receiver:{" "}
        {staffRoleLabel(q.toRole)}
        {q.stage ? ` · stage: ${q.stage}` : ""}
      </Text>
      <FlatList
        data={q.orders}
        keyExtractor={(o) => o.id}
        scrollEnabled={false}
        renderItem={({ item: o }) => (
          <Pressable onPress={() => onOpenOrder(o.id)}>
            <View
              style={{
                borderTopWidth: 1,
                borderTopColor: "#eef2f1",
                paddingVertical: 9,
                gap: 3,
              }}
            >
              <View style={styles.rowBetween}>
                <Text style={{ fontWeight: "700" }}>
                  {o.customerName ?? "Customer"} · {o.itemCount} item
                  {o.itemCount === 1 ? "" : "s"}
                </Text>
                <Badge label={statusLabel(o.status)} />
              </View>
              <Text style={styles.muted}>
                Placed {formatWhen(o.createdAt)} · pickup {formatWhen(o.pickupSlot)} — tap to
                complete the handover
              </Text>
            </View>
          </Pressable>
        )}
      />
    </Card>
  );
});

export default function AdminStagesScreen() {
  const { isAdmin } = useAuth();
  const [employees, setEmployees] = useState<Employee[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [stages, setStages] = useState<StagesResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [queueError, setQueueError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const activeEmployees = useMemo(
    () => (employees ?? []).filter((e) => e.employmentStatus === "active"),
    [employees],
  );

  const loadEmployees = useCallback(async () => {
    setError(null);
    try {
      setEmployees(await fetchEmployees());
    } catch {
      setError("Could not load employees. Check the connection and try again.");
    }
  }, []);

  const loadQueues = useCallback(async (employeeId: string, keepExisting = false) => {
    setQueueError(null);
    if (!keepExisting) setStages(null);
    try {
      setStages(await fetchStages(employeeId));
    } catch {
      setQueueError("Could not load this employee's queues. Try again.");
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (isAdmin) void loadEmployees();
    }, [isAdmin, loadEmployees]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadEmployees();
      // Refresh keeps the current queues on screen until new data lands.
      if (selectedId) await loadQueues(selectedId, true);
    } finally {
      setRefreshing(false);
    }
  }, [loadEmployees, loadQueues, selectedId]);

  const pick = (id: string) => {
    setSelectedId(id);
    void loadQueues(id);
  };

  const openOrder = useCallback((id: string) => {
    router.push(`/admin-order/${id}`);
  }, []);

  if (!isAdmin) {
    return (
      <Screen admin>
        <Title>Stage queues</Title>
        <Text style={styles.muted}>This section is for Sri Clean admins only.</Text>
      </Screen>
    );
  }

  const totalWaiting = stages?.queues.reduce((sum, q) => sum + q.count, 0) ?? 0;

  const header = (
    <>
      <Title>Stage queues</Title>
      <Text style={styles.muted}>
        Choose the employee who is receiving items. You will see the handover points their roles
        cover and the orders waiting at each one.
      </Text>

      {error ? (
        <ErrorBlock message={error} onRetry={() => void loadEmployees()} />
      ) : !employees ? (
        <SkeletonRows />
      ) : activeEmployees.length === 0 ? (
        <EmptyBlock message="No active employees yet. Add staff in Employees first." />
      ) : (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={{ flexDirection: "row", gap: 8, paddingVertical: 2 }}>
              {activeEmployees.map((e) => (
                <Pressable
                  key={e.id}
                  onPress={() => pick(e.id)}
                  style={[styles.chip, selectedId === e.id && styles.chipSelected]}
                >
                  <Text style={[styles.chipText, selectedId === e.id && styles.chipTextSelected]}>
                    {e.fullName}
                  </Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>

          {selectedId && stages?.employee ? (
            <Card>
              <Text style={styles.label}>
                {stages.employee.fullName} ({stages.employee.employeeCode})
              </Text>
              <Text style={styles.muted}>
                Roles: {stages.employee.roles.map(staffRoleLabel).join(", ") || "—"} ·{" "}
                {totalWaiting} order{totalWaiting === 1 ? "" : "s"} waiting
              </Text>
            </Card>
          ) : null}
        </>
      )}
    </>
  );

  const empty =
    !employees || error || activeEmployees.length === 0 ? undefined : queueError ? (
      <ErrorBlock message={queueError} onRetry={() => selectedId && void loadQueues(selectedId)} />
    ) : selectedId && !stages ? (
      <SkeletonRows />
    ) : stages ? (
      stages.queues.length === 0 ? (
        <EmptyBlock message="This employee's roles do not receive at any handover point." />
      ) : undefined
    ) : (
      <EmptyBlock message="Pick an employee above to see their queues." />
    );

  return (
    <Screen scroll={false} admin>
      <FlatList
        data={stages?.queues ?? []}
        keyExtractor={(q) => q.pointId}
        renderItem={({ item }) => <QueueCard queue={item} onOpenOrder={openOrder} />}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
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
