import { useFocusEffect } from "expo-router";
import { memo, useCallback, useMemo, useState } from "react";
import { Alert, FlatList, RefreshControl, ScrollView, Text, View } from "react-native";
import { Field, MultiChips, SelectChips, StepperRow, fieldErrorText } from "../components/forms";
import {
  Badge,
  Card,
  Chip,
  EmptyBlock,
  ErrorBlock,
  GhostButton,
  PrimaryButton,
  Screen,
  SkeletonRows,
  Title,
  styles,
} from "../components/ui";
import { useAuth } from "../context/AuthContext";
import {
  ApiError,
  createVouchers,
  fetchBranches,
  fetchEmployees,
  fetchVoucherDetail,
  fetchVouchers,
  patchVoucher,
} from "../lib/api";
import { brand } from "../lib/config";
import { formatPaise, formatWhen } from "../lib/format";
import { SERVICE_OPTIONS } from "../lib/org";
import type { Branch, Employee, GiftVoucher, VoucherTransaction } from "../lib/types";

/**
 * Gift vouchers (Mobile Phase 2) — the Phase 7b web admin in the app:
 * list + status filter + code search, campaign create (prepaid gift
 * cards vs promo discounts kept strictly distinct), issue / cancel /
 * expire, and the per-voucher transaction ledger. Money crosses the
 * API in integer paise; the form collects ₹ like the web does.
 */

const STATUSES = ["created", "issued", "partially_redeemed", "redeemed", "expired", "cancelled"];
const TERMINAL = new Set(["redeemed", "expired", "cancelled"]);

function rupeesToPaise(text: string): number | undefined {
  const n = Number(text);
  if (text.trim() === "" || !Number.isFinite(n)) return undefined;
  return Math.round(n * 100);
}

function voucherValueLabel(v: GiftVoucher): string {
  if (v.kind === "prepaid_card") {
    return `Gift card · balance ${formatPaise(v.balancePaise ?? 0)} of ${formatPaise(v.faceValuePaise ?? 0)}`;
  }
  return v.discountType === "percent"
    ? `Promo · ${v.discountValue ?? 0}% off`
    : `Promo · ${formatPaise(v.discountValue ?? 0)} off`;
}

function statusTone(status: string): "teal" | "amber" | "green" | "red" | "grey" {
  if (status === "issued" || status === "partially_redeemed") return "amber";
  if (status === "redeemed") return "green";
  if (status === "cancelled" || status === "expired") return "red";
  return "grey";
}

export default function AdminVouchersScreen() {
  const { isAdmin } = useAuth();
  const [vouchers, setVouchers] = useState<GiftVoucher[] | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [list, emps, brs] = await Promise.all([
        fetchVouchers(),
        fetchEmployees().catch(() => [] as Employee[]),
        fetchBranches().catch(() => [] as Branch[]),
      ]);
      setVouchers(list);
      setEmployees(emps);
      setBranches(brs);
    } catch {
      setError("Could not load vouchers. Check the connection and try again.");
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (isAdmin) void load();
    }, [isAdmin, load]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  const handleChanged = useCallback(() => {
    void load();
  }, [load]);

  const visible = useMemo(() => {
    if (!vouchers) return [];
    return vouchers.filter((v) => {
      if (statusFilter !== "ALL" && v.status !== statusFilter) return false;
      if (search.trim() && !v.code.toLowerCase().includes(search.trim().toLowerCase())) return false;
      return true;
    });
  }, [vouchers, statusFilter, search]);

  if (!isAdmin) {
    return (
      <Screen>
        <Title>Gift vouchers</Title>
        <Text style={styles.muted}>This section is for Z-clean admins only.</Text>
      </Screen>
    );
  }

  const header = (
    <>
      <Title>Gift vouchers</Title>
      <PrimaryButton
        label={showCreate ? "Close the create form" : "＋ Create vouchers"}
        onPress={() => setShowCreate((s) => !s)}
      />
      {showCreate ? (
        <CreateVoucherForm
          branches={branches}
          onCreated={() => {
            setShowCreate(false);
            void load();
          }}
        />
      ) : null}

      <Field label="Search by code" value={search} onChangeText={setSearch} placeholder="ZCGIFT-…" autoCapitalize="characters" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={{ flexDirection: "row", gap: 8, paddingVertical: 2 }}>
          <Chip label="All" selected={statusFilter === "ALL"} onPress={() => setStatusFilter("ALL")} />
          {STATUSES.map((s) => (
            <Chip
              key={s}
              label={s.replaceAll("_", " ")}
              selected={statusFilter === s}
              onPress={() => setStatusFilter(s)}
            />
          ))}
        </View>
      </ScrollView>
    </>
  );

  if (!vouchers && !error) {
    return (
      <Screen>
        {header}
        <SkeletonRows />
      </Screen>
    );
  }

  return (
    <Screen scroll={false}>
      <FlatList
        data={visible}
        keyExtractor={(v) => v.id}
        renderItem={({ item }) => (
          <VoucherCard voucher={item} employees={employees} onChanged={handleChanged} />
        )}
        ListHeaderComponent={header}
        ListEmptyComponent={
          error ? (
            <ErrorBlock message={error} onRetry={() => void load()} />
          ) : (
            <EmptyBlock message="No vouchers match. Create a campaign above." />
          )
        }
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

const VoucherCard = memo(function VoucherCard({
  voucher: v,
  employees,
  onChanged,
}: {
  voucher: GiftVoucher;
  employees: Employee[];
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [showIssue, setShowIssue] = useState(false);
  const [issueName, setIssueName] = useState("");
  const [issuePhone, setIssuePhone] = useState("");
  const [issueEmployeeId, setIssueEmployeeId] = useState<string | null>(null);
  const [history, setHistory] = useState<VoucherTransaction[] | null>(null);
  const [historyBusy, setHistoryBusy] = useState(false);

  async function runAction(action: "issue" | "cancel" | "expire") {
    setBusy(true);
    setActionError(null);
    try {
      await patchVoucher(v.id, {
        action,
        issuedToName: action === "issue" ? issueName.trim() || undefined : undefined,
        issuedToPhone: action === "issue" ? issuePhone.trim() || undefined : undefined,
        issuedToEmployeeId: action === "issue" ? (issueEmployeeId ?? undefined) : undefined,
      });
      setShowIssue(false);
      onChanged();
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : "The action failed. Try again.");
    } finally {
      setBusy(false);
    }
  }

  function confirmDestructive(action: "cancel" | "expire") {
    Alert.alert(
      action === "cancel" ? "Cancel this voucher?" : "Expire this voucher?",
      action === "cancel" && v.kind === "prepaid_card"
        ? "Cancelling a gift card voids its remaining balance. This cannot be undone."
        : "This cannot be undone.",
      [
        { text: "Keep it", style: "cancel" },
        { text: action === "cancel" ? "Cancel voucher" : "Expire it", style: "destructive", onPress: () => void runAction(action) },
      ],
    );
  }

  async function toggleHistory() {
    if (history) {
      setHistory(null);
      return;
    }
    setHistoryBusy(true);
    try {
      const detail = await fetchVoucherDetail(v.id);
      setHistory(detail.transactions);
    } catch {
      setActionError("Could not load the transaction history.");
    } finally {
      setHistoryBusy(false);
    }
  }

  return (
    <Card>
      <View style={styles.rowBetween}>
        <Text style={{ fontWeight: "800", fontSize: 15 }}>{v.code}</Text>
        <Badge label={v.status.replaceAll("_", " ")} tone={statusTone(v.status)} />
      </View>
      <Text style={styles.muted}>{voucherValueLabel(v)}</Text>
      <Text style={styles.muted}>
        {v.minOrderPaise > 0 ? `Min order ${formatPaise(v.minOrderPaise)} · ` : ""}
        Used {v.timesUsed} of {v.usageLimit}
        {v.branchName ? ` · ${v.branchName}` : ""}
        {v.eligibleServices.length > 0 ? ` · ${v.eligibleServices.length} services only` : ""}
      </Text>
      <Text style={styles.muted}>
        {v.validFrom || v.validUntil
          ? `Valid ${v.validFrom ?? "…"} → ${v.validUntil ?? "…"} · `
          : ""}
        Created {formatWhen(v.createdAt)}
      </Text>
      {v.issuedToName ? (
        <Text style={styles.muted}>
          Issued to {v.issuedToName}
          {v.issuedToPhone ? ` · ${v.issuedToPhone}` : ""}
        </Text>
      ) : null}

      {actionError ? <Text style={styles.errorText}>{actionError}</Text> : null}

      {showIssue ? (
        <View style={{ gap: 10 }}>
          <Field label="Issued to — name" value={issueName} onChangeText={setIssueName} placeholder="Customer or recipient name" />
          <Field label="Phone (optional)" value={issuePhone} onChangeText={setIssuePhone} keyboardType="phone-pad" placeholder="10-digit mobile" />
          <SelectChips
            label="…or issue to an employee"
            options={employees.map((e) => ({ value: e.id, label: `${e.fullName} (${e.employeeCode})` }))}
            value={issueEmployeeId}
            onChange={setIssueEmployeeId}
            includeNoneLabel="No employee"
          />
          <PrimaryButton label="Issue voucher" busy={busy} onPress={() => void runAction("issue")} />
          <GhostButton label="Back" onPress={() => setShowIssue(false)} />
        </View>
      ) : (
        <View style={styles.rowWrap}>
          {v.status === "created" ? (
            <GhostButton label="Issue" disabled={busy} onPress={() => setShowIssue(true)} />
          ) : null}
          {!TERMINAL.has(v.status) ? (
            <>
              <GhostButton label="Expire" disabled={busy} onPress={() => confirmDestructive("expire")} />
              <GhostButton label="Cancel" disabled={busy} onPress={() => confirmDestructive("cancel")} />
            </>
          ) : null}
          <GhostButton
            label={history ? "Hide history" : "History"}
            disabled={historyBusy}
            onPress={() => void toggleHistory()}
          />
        </View>
      )}

      {history ? (
        <View style={{ gap: 6 }}>
          {history.length === 0 ? (
            <Text style={styles.muted}>No transactions yet.</Text>
          ) : (
            history.map((t) => (
              <Text key={t.id} style={styles.muted}>
                {t.txnType}
                {t.amountPaise > 0 ? ` · ${formatPaise(t.amountPaise)}` : ""}
                {t.balanceAfterPaise !== null ? ` · balance ${formatPaise(t.balanceAfterPaise)}` : ""} ·{" "}
                {formatWhen(t.createdAt)}
                {t.note ? ` — ${t.note}` : ""}
              </Text>
            ))
          )}
        </View>
      ) : null}
    </Card>
  );
});

function CreateVoucherForm({
  branches,
  onCreated,
}: {
  branches: Branch[];
  onCreated: () => void;
}) {
  const [kind, setKind] = useState<"prepaid_card" | "promo">("promo");
  const [faceValue, setFaceValue] = useState("");
  const [discountType, setDiscountType] = useState<"fixed" | "percent">("percent");
  const [discountValue, setDiscountValue] = useState("");
  const [maxDiscount, setMaxDiscount] = useState("");
  const [minOrder, setMinOrder] = useState("");
  const [usageLimit, setUsageLimit] = useState(1);
  const [quantity, setQuantity] = useState(1);
  const [validFrom, setValidFrom] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [eligibleServices, setEligibleServices] = useState<string[]>([]);
  const [branchId, setBranchId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string> | undefined>(undefined);

  const toggleService = (slug: string) =>
    setEligibleServices((prev) => (prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug]));

  async function submit() {
    setBusy(true);
    setFormError(null);
    setFieldErrors(undefined);
    try {
      await createVouchers({
        kind,
        quantity,
        faceValuePaise: kind === "prepaid_card" ? rupeesToPaise(faceValue) : undefined,
        discountType: kind === "promo" ? discountType : undefined,
        discountValue:
          kind === "promo"
            ? discountType === "percent"
              ? Number(discountValue) || undefined
              : rupeesToPaise(discountValue)
            : undefined,
        maxDiscountPaise: kind === "promo" && discountType === "percent" ? (rupeesToPaise(maxDiscount) ?? null) : undefined,
        minOrderPaise: rupeesToPaise(minOrder) ?? 0,
        eligibleServices,
        branchId,
        usageLimit,
        validFrom: validFrom.trim() || null,
        validUntil: validUntil.trim() || null,
      });
      onCreated();
    } catch (e) {
      if (e instanceof ApiError) {
        setFormError(e.message);
        setFieldErrors(e.fieldErrors);
      } else {
        setFormError("Could not create the vouchers. Try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <Text style={styles.label}>Create a voucher campaign</Text>
      <Text style={styles.muted}>
        Prepaid gift cards hold a spendable balance; promo vouchers give a discount. The two never
        mix. A batch mints that many codes with identical terms.
      </Text>
      <SelectChips
        label="Kind"
        options={[
          { value: "promo" as const, label: "Promo discount" },
          { value: "prepaid_card" as const, label: "Prepaid gift card" },
        ]}
        value={kind}
        onChange={(v) => v && setKind(v)}
      />
      {kind === "prepaid_card" ? (
        <Field
          label="Face value (₹)"
          value={faceValue}
          onChangeText={setFaceValue}
          keyboardType="decimal-pad"
          placeholder="e.g. 500"
          error={fieldErrorText(fieldErrors, "faceValuePaise")}
        />
      ) : (
        <>
          <SelectChips
            label="Discount type"
            options={[
              { value: "percent" as const, label: "Percent (%)" },
              { value: "fixed" as const, label: "Fixed amount (₹)" },
            ]}
            value={discountType}
            onChange={(v) => v && setDiscountType(v)}
          />
          <Field
            label={discountType === "percent" ? "Percent off" : "Amount off (₹)"}
            value={discountValue}
            onChangeText={setDiscountValue}
            keyboardType="decimal-pad"
            placeholder={discountType === "percent" ? "e.g. 10" : "e.g. 100"}
            error={fieldErrorText(fieldErrors, "discountValue")}
          />
          {discountType === "percent" ? (
            <Field
              label="Max discount cap (₹, optional)"
              value={maxDiscount}
              onChangeText={setMaxDiscount}
              keyboardType="decimal-pad"
              placeholder="e.g. 200"
            />
          ) : null}
        </>
      )}
      <Field label="Minimum order (₹, optional)" value={minOrder} onChangeText={setMinOrder} keyboardType="decimal-pad" placeholder="e.g. 499" />
      <StepperRow label="Uses per code" value={usageLimit} onChange={setUsageLimit} min={1} max={1000} />
      <StepperRow label="Codes in this batch" value={quantity} onChange={setQuantity} min={1} max={50} />
      <Field label="Valid from (YYYY-MM-DD, optional)" value={validFrom} onChangeText={setValidFrom} placeholder="2026-11-05" error={fieldErrorText(fieldErrors, "validFrom")} />
      <Field label="Valid until (YYYY-MM-DD, optional)" value={validUntil} onChangeText={setValidUntil} placeholder="2026-12-31" error={fieldErrorText(fieldErrors, "validUntil")} />
      <MultiChips
        label="Eligible services (none selected = all services)"
        options={SERVICE_OPTIONS.map((s) => ({ value: s.slug, label: s.name }))}
        values={eligibleServices}
        onToggle={toggleService}
      />
      <SelectChips
        label="Restrict to a branch (optional)"
        options={branches.map((b) => ({ value: b.id, label: b.name }))}
        value={branchId}
        onChange={setBranchId}
        includeNoneLabel="All branches"
      />
      {formError ? <Text style={styles.errorText}>{formError}</Text> : null}
      <PrimaryButton label={`Create ${quantity} voucher${quantity === 1 ? "" : "s"}`} busy={busy} onPress={() => void submit()} />
    </Card>
  );
}
