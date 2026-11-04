import { useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { Alert, Text, View } from "react-native";
import { Field, SelectChips } from "../components/forms";
import {
  Card,
  Chip,
  EmptyBlock,
  ErrorBlock,
  LoadingBlock,
  PrimaryButton,
  Screen,
  Subtitle,
  Title,
  styles,
} from "../components/ui";
import {
  ApiError,
  createExpense,
  deleteExpense,
  fetchBranches,
  fetchExpenses,
} from "../lib/api";
import {
  EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_LABELS,
  istToday,
  rupeesToPaise,
  shiftDate,
} from "../lib/finance";
import { formatPaise } from "../lib/format";
import type { Branch, ExpenseRow } from "../lib/types";

type RangeKey = "today" | "7d" | "30d" | "all";

const RANGES: { key: RangeKey; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "7d", label: "Last 7 days" },
  { key: "30d", label: "Last 30 days" },
  { key: "all", label: "All" },
];

function rangeParams(range: RangeKey): { from?: string; to?: string } {
  const today = istToday();
  if (range === "today") return { from: today, to: today };
  if (range === "7d") return { from: shiftDate(today, -6), to: today };
  if (range === "30d") return { from: shiftDate(today, -29), to: today };
  return {};
}

/**
 * Expenses (Mobile Phase 3) — the web admin's expense ledger,
 * native: list over a date range (the API's ?from/?to), the
 * add-expense form and audit-logged deletion.
 */
export default function AdminExpensesScreen() {
  const [range, setRange] = useState<RangeKey>("30d");
  const [expenses, setExpenses] = useState<ExpenseRow[] | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const [expDate, setExpDate] = useState(istToday());
  const [category, setCategory] = useState<string>("detergent");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [branchId, setBranchId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [rows, brs] = await Promise.all([fetchExpenses(rangeParams(range)), fetchBranches()]);
      setExpenses(rows);
      setBranches(brs);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load expenses.");
    }
  }, [range]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const total = useMemo(
    () => (expenses ?? []).reduce((s, e) => s + e.amountPaise, 0),
    [expenses],
  );

  async function submit() {
    setFormError(null);
    setFeedback(null);
    const amountPaise = rupeesToPaise(amount);
    if (amountPaise === null || amountPaise <= 0) {
      setFormError("Enter an expense amount above zero.");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(expDate)) {
      setFormError("Use a date in YYYY-MM-DD format.");
      return;
    }
    setBusy(true);
    try {
      await createExpense({
        expenseDate: expDate,
        category,
        description: description.trim() || undefined,
        amountPaise,
        branchId: branchId ?? null,
      });
      setFeedback("Expense recorded.");
      setAmount("");
      setDescription("");
      await load();
    } catch (e) {
      setFormError(e instanceof ApiError ? e.message : "The expense could not be recorded.");
    } finally {
      setBusy(false);
    }
  }

  function remove(expense: ExpenseRow) {
    Alert.alert(
      "Delete this expense?",
      `${EXPENSE_CATEGORY_LABELS[expense.category] ?? expense.category} — ${formatPaise(expense.amountPaise)} on ${expense.expenseDate}. The deletion is written to the audit log.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteExpense(expense.id);
              setFeedback("Expense deleted — the deletion is in the audit log.");
              await load();
            } catch (e) {
              Alert.alert("Expenses", e instanceof ApiError ? e.message : "The expense could not be deleted.");
            }
          },
        },
      ],
    );
  }

  if (error && !expenses) {
    return (
      <Screen admin>
        <ErrorBlock message={error} onRetry={() => void load()} />
      </Screen>
    );
  }

  return (
    <Screen admin>
      <Title>Expenses</Title>
      <Subtitle>The spend ledger behind the sales-vs-expense report.</Subtitle>
      {feedback ? (
        <Card>
          <Text style={{ color: "#15803d", fontWeight: "700", fontSize: 14 }}>{feedback}</Text>
        </Card>
      ) : null}

      <View style={styles.rowWrap}>
        {RANGES.map((r) => (
          <Chip key={r.key} label={r.label} selected={range === r.key} onPress={() => setRange(r.key)} />
        ))}
      </View>

      <Card>
        <Text style={styles.label}>Add an expense</Text>
        <Field label="Date (YYYY-MM-DD)" value={expDate} onChangeText={setExpDate} placeholder="2026-11-04" />
        <SelectChips
          label="Category"
          options={EXPENSE_CATEGORIES.map((c) => ({ value: c, label: EXPENSE_CATEGORY_LABELS[c] }))}
          value={category}
          onChange={(v) => v && setCategory(v)}
        />
        <Field
          label="Amount (₹)"
          keyboardType="decimal-pad"
          value={amount}
          onChangeText={setAmount}
          placeholder="0.00"
        />
        <Field
          label="Description (optional)"
          value={description}
          onChangeText={setDescription}
          maxLength={300}
          placeholder="e.g. Detergent — 20 kg"
        />
        <SelectChips
          label="Branch (optional)"
          options={branches.map((b) => ({ value: b.id, label: b.name }))}
          value={branchId}
          onChange={setBranchId}
          includeNoneLabel="Whole business"
        />
        {formError ? <Text style={styles.errorText}>{formError}</Text> : null}
        <PrimaryButton label="Add expense" busy={busy} onPress={() => void submit()} />
      </Card>

      <Card>
        <Text style={styles.label}>
          {RANGES.find((r) => r.key === range)?.label} — total {formatPaise(total)}
        </Text>
        {!expenses ? (
          <LoadingBlock label="Loading expenses…" />
        ) : expenses.length === 0 ? (
          <EmptyBlock message="No expenses recorded in this range yet." />
        ) : (
          expenses.slice(0, 50).map((e) => (
            <View key={e.id} style={[styles.rowBetween, { paddingVertical: 6 }]}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ fontWeight: "700", fontSize: 14 }}>
                  {EXPENSE_CATEGORY_LABELS[e.category] ?? e.category}
                  {e.description ? ` — ${e.description}` : ""}
                </Text>
                <Text style={styles.muted}>
                  {e.expenseDate}
                  {e.branchName ? ` · ${e.branchName}` : ""}
                  {e.actorLabel ? ` · by ${e.actorLabel}` : ""}
                </Text>
              </View>
              <Text style={styles.totalValue}>{formatPaise(e.amountPaise)}</Text>
              <Chip label="Delete" selected={false} onPress={() => remove(e)} />
            </View>
          ))
        )}
      </Card>
    </Screen>
  );
}
