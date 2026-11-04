"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatPaise } from "@/lib/pricing";
import { Skeleton, SkeletonText } from "@/components/Skeleton";
import { services } from "@/lib/services";
import type { Branch, Employee } from "@/lib/org";
import {
  listDemoBranches,
  listDemoEmployees,
  listDemoVoucherTransactions,
  listDemoVouchers,
  newDemoId,
  newDemoTxn,
  saveDemoVoucherTransactions,
  saveDemoVouchers,
  type DemoVoucher,
} from "@/lib/demo-org";
import {
  voucherCreateSchema,
  voucherActionSchema,
} from "@/lib/validation";
import {
  generateVoucherCode,
  VOUCHER_STATUSES,
  type GiftVoucher,
  type VoucherStatus,
  type VoucherTransaction,
} from "@/lib/vouchers";

/**
 * Gift Voucher Management (Phase 7b — Requirements v2 §3).
 *
 * Two kinds, kept strictly separate:
 *  - prepaid_card: a gift card. Face value = balance; spending it is a
 *    PAYMENT (recorded in payments, gateway 'voucher').
 *  - promo: a discount code. It reduces the order total at checkout and
 *    can never be redeemed for cash or at the cashier desk.
 *
 * Create mints a batch of unique ZCGIFT- codes in status 'created';
 * issue hands one to a named person or an employee; cancel/expire close
 * it. Every step is ledgered in voucher_transactions and audit-logged
 * (live mode). Demo mode runs on this browser's demo store under the
 * layout's DEMO MODE banner.
 */

const inputClass =
  "min-h-[44px] w-full rounded-xl border border-brand-200 px-3 py-2.5 text-sm text-ink-900 placeholder:text-ink-500/70 focus:border-brand-500 focus:outline-none";
const labelClass = "grid gap-1.5 text-sm";
const labelTextClass = "font-semibold text-ink-900";

type VoucherView = GiftVoucher & { branchName: string | null };

const STATUS_STYLES: Record<VoucherStatus, string> = {
  created: "bg-brand-50 text-brand-700",
  issued: "bg-green-50 text-green-700",
  partially_redeemed: "bg-amber-50 text-amber-800",
  redeemed: "bg-ink-900/5 text-ink-700",
  expired: "bg-red-50 text-red-700",
  cancelled: "bg-red-50 text-red-700",
};

const TERMINAL: ReadonlySet<VoucherStatus> = new Set(["redeemed", "expired", "cancelled"]);

function valueSummary(v: GiftVoucher): string {
  if (v.kind === "prepaid_card") {
    return `Balance ${formatPaise(v.balancePaise ?? 0)} of ${formatPaise(v.faceValuePaise ?? 0)}`;
  }
  const base =
    v.discountType === "percent"
      ? `${v.discountValue ?? 0}% off`
      : `${formatPaise(v.discountValue ?? 0)} off`;
  return v.maxDiscountPaise ? `${base} (max ${formatPaise(v.maxDiscountPaise)})` : base;
}

function validitySummary(v: GiftVoucher): string {
  if (!v.validFrom && !v.validUntil) return "No expiry set";
  return `${v.validFrom ?? "…"} → ${v.validUntil ?? "…"}`;
}

interface CreateForm {
  kind: "prepaid_card" | "promo";
  quantity: string;
  faceValueInr: string;
  discountType: "fixed" | "percent";
  discountValue: string;
  maxDiscountInr: string;
  minOrderInr: string;
  eligibleServices: string[];
  branchId: string;
  usageLimit: string;
  validFrom: string;
  validUntil: string;
}

const EMPTY_CREATE: CreateForm = {
  kind: "prepaid_card",
  quantity: "1",
  faceValueInr: "",
  discountType: "percent",
  discountValue: "",
  maxDiscountInr: "",
  minOrderInr: "",
  eligibleServices: [],
  branchId: "",
  usageLimit: "1",
  validFrom: "",
  validUntil: "",
};

export default function AdminVouchers({ mode }: { mode: "live" | "demo" }) {
  const [vouchers, setVouchers] = useState<VoucherView[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const [statusFilter, setStatusFilter] = useState("ALL");
  const [form, setForm] = useState<CreateForm>(EMPTY_CREATE);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [history, setHistory] = useState<VoucherTransaction[]>([]);
  const [qrFor, setQrFor] = useState<string | null>(null);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [issueFor, setIssueFor] = useState<string | null>(null);
  const [issueForm, setIssueForm] = useState({ name: "", phone: "", employeeId: "" });

  const loadLive = useCallback(async () => {
    try {
      const [vRes, bRes, eRes] = await Promise.all([
        fetch("/api/admin/vouchers"),
        fetch("/api/admin/branches"),
        fetch("/api/admin/employees"),
      ]);
      const vJson = await vRes.json().catch(() => null);
      if (!vRes.ok || !vJson || vJson.mode !== "live") {
        setLoadError(vJson?.error ?? "Could not load vouchers.");
        return;
      }
      setVouchers(vJson.vouchers as VoucherView[]);
      const bJson = await bRes.json().catch(() => null);
      if (bRes.ok && bJson?.mode === "live") setBranches(bJson.branches as Branch[]);
      const eJson = await eRes.json().catch(() => null);
      if (eRes.ok && eJson?.mode === "live") setEmployees(eJson.employees as Employee[]);
    } catch {
      setLoadError("Could not load vouchers.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadDemo = useCallback(() => {
    setVouchers(listDemoVouchers());
    setBranches(listDemoBranches());
    setEmployees(listDemoEmployees());
    setLoading(false);
  }, []);

  useEffect(() => {
    if (mode === "live") void loadLive();
    else loadDemo();
  }, [mode, loadLive, loadDemo]);

  const filtered = useMemo(
    () => vouchers.filter((v) => statusFilter === "ALL" || v.status === statusFilter),
    [vouchers, statusFilter],
  );

  function buildCreatePayload() {
    const rupees = (s: string) => {
      const n = Number(s);
      return s.trim() === "" || !Number.isFinite(n) ? undefined : Math.round(n * 100);
    };
    return {
      kind: form.kind,
      quantity: Math.max(1, Math.min(50, Number(form.quantity) || 1)),
      faceValuePaise: form.kind === "prepaid_card" ? rupees(form.faceValueInr) : undefined,
      discountType: form.kind === "promo" ? form.discountType : undefined,
      discountValue:
        form.kind === "promo"
          ? form.discountType === "percent"
            ? Number(form.discountValue) || undefined
            : rupees(form.discountValue)
          : undefined,
      maxDiscountPaise: form.kind === "promo" ? (rupees(form.maxDiscountInr) ?? null) : undefined,
      minOrderPaise: rupees(form.minOrderInr) ?? 0,
      eligibleServices: form.eligibleServices,
      branchId: form.branchId || null,
      usageLimit: Math.max(1, Number(form.usageLimit) || 1),
      validFrom: form.validFrom || null,
      validUntil: form.validUntil || null,
    };
  }

  async function submitCreate(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFormError(null);
    setFeedback(null);
    setFieldErrors({});
    const payload = buildCreatePayload();
    try {
      if (mode === "demo") {
        const parsed = voucherCreateSchema.safeParse(payload);
        if (!parsed.success) {
          const fe: Record<string, string> = {};
          for (const issue of parsed.error.issues) {
            const key = String(issue.path[0] ?? "form");
            if (!fe[key]) fe[key] = issue.message;
          }
          setFieldErrors(fe);
          setFormError("Please fix the highlighted fields.");
          return;
        }
        const input = parsed.data;
        const quantity = input.quantity ?? 1;
        const codes = new Set<string>();
        while (codes.size < quantity) codes.add(generateVoucherCode());
        const branchName = input.branchId
          ? (branches.find((b) => b.id === input.branchId)?.name ?? null)
          : null;
        const created: DemoVoucher[] = [...codes].map((code) => ({
          id: newDemoId("voucher"),
          code,
          kind: input.kind,
          faceValuePaise: input.kind === "prepaid_card" ? (input.faceValuePaise ?? null) : null,
          balancePaise: input.kind === "prepaid_card" ? (input.faceValuePaise ?? null) : null,
          discountType: input.kind === "promo" ? (input.discountType ?? null) : null,
          discountValue: input.kind === "promo" ? (input.discountValue ?? null) : null,
          maxDiscountPaise: input.kind === "promo" ? (input.maxDiscountPaise ?? null) : null,
          minOrderPaise: input.minOrderPaise ?? 0,
          eligibleServices: input.eligibleServices ?? [],
          branchId: input.branchId ?? null,
          usageLimit: input.usageLimit ?? 1,
          timesUsed: 0,
          status: "created",
          issuedToName: null,
          issuedToPhone: null,
          issuedToEmployeeId: null,
          issuedByLabel: null,
          validFrom: input.validFrom ?? null,
          validUntil: input.validUntil ?? null,
          createdAt: new Date().toISOString(),
          branchName,
        }));
        const next = [...created, ...listDemoVouchers()];
        saveDemoVouchers(next);
        setVouchers(next);
        setFeedback(
          quantity === 1
            ? `Demo voucher ${created[0].code} created.`
            : `${quantity} demo vouchers created.`,
        );
        setForm(EMPTY_CREATE);
        return;
      }

      const res = await fetch("/api/admin/vouchers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        if (json?.fieldErrors) {
          const fe: Record<string, string> = {};
          for (const [k, v] of Object.entries(json.fieldErrors as Record<string, string[]>)) {
            if (Array.isArray(v) && v[0]) fe[k] = v[0];
          }
          setFieldErrors(fe);
        }
        setFormError(json?.error ?? "Could not create the vouchers.");
        return;
      }
      setFeedback(
        json.vouchers.length === 1
          ? `Voucher ${json.vouchers[0].code} created.`
          : `${json.vouchers.length} vouchers created.`,
      );
      setForm(EMPTY_CREATE);
      await loadLive();
    } catch {
      setFormError("Could not create the vouchers. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function runAction(voucher: VoucherView, action: "cancel" | "expire") {
    setBusy(true);
    setFormError(null);
    setFeedback(null);
    try {
      if (mode === "demo") {
        const parsed = voucherActionSchema.safeParse({ action });
        if (!parsed.success) {
          setFormError("That action is not valid.");
          return;
        }
        const all = listDemoVouchers();
        const target = all.find((v) => v.id === voucher.id);
        if (!target || TERMINAL.has(target.status)) {
          setFormError("This voucher can no longer change.");
          return;
        }
        const updated: DemoVoucher = {
          ...target,
          status: action === "cancel" ? "cancelled" : "expired",
          balancePaise:
            action === "cancel" && target.kind === "prepaid_card" ? 0 : target.balancePaise,
        };
        const next = all.map((v) => (v.id === voucher.id ? updated : v));
        saveDemoVouchers(next);
        const txns = listDemoVoucherTransactions();
        saveDemoVoucherTransactions([
          newDemoTxn({
            voucherId: voucher.id,
            orderId: null,
            txnType: action,
            amountPaise: 0,
            balanceAfterPaise: updated.balancePaise,
            actorLabel: "demo admin",
            note: action === "cancel" ? "Cancelled (demo)" : "Marked expired (demo)",
          }),
          ...txns,
        ]);
        setVouchers(next);
        setFeedback(`Voucher ${voucher.code} ${action === "cancel" ? "cancelled" : "marked expired"} (demo).`);
        return;
      }

      const res = await fetch(`/api/admin/vouchers/${voucher.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setFormError(json?.error ?? "Could not update the voucher.");
        return;
      }
      setFeedback(`Voucher ${voucher.code} ${action === "cancel" ? "cancelled" : "marked expired"}.`);
      await loadLive();
    } catch {
      setFormError("Could not update the voucher. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function submitIssue(voucher: VoucherView) {
    setBusy(true);
    setFormError(null);
    setFeedback(null);
    const body = {
      action: "issue" as const,
      issuedToName: issueForm.name.trim() || undefined,
      issuedToPhone: issueForm.phone.trim() || "",
      issuedToEmployeeId: issueForm.employeeId || null,
    };
    try {
      if (mode === "demo") {
        const parsed = voucherActionSchema.safeParse(body);
        if (!parsed.success || (!body.issuedToName && !body.issuedToEmployeeId)) {
          setFormError("Tell us who the voucher is issued to (a name, or pick an employee).");
          return;
        }
        const all = listDemoVouchers();
        const target = all.find((v) => v.id === voucher.id);
        if (!target || target.status !== "created") {
          setFormError("Only a newly created voucher can be issued.");
          return;
        }
        const employee = body.issuedToEmployeeId
          ? employees.find((emp) => emp.id === body.issuedToEmployeeId)
          : undefined;
        const updated: DemoVoucher = {
          ...target,
          status: "issued",
          issuedToName: body.issuedToName ?? employee?.fullName ?? null,
          issuedToPhone: body.issuedToPhone || null,
          issuedToEmployeeId: body.issuedToEmployeeId ?? null,
          issuedByLabel: "demo admin",
        };
        const next = all.map((v) => (v.id === voucher.id ? updated : v));
        saveDemoVouchers(next);
        const txns = listDemoVoucherTransactions();
        saveDemoVoucherTransactions([
          newDemoTxn({
            voucherId: voucher.id,
            orderId: null,
            txnType: "issue",
            amountPaise: target.kind === "prepaid_card" ? (target.faceValuePaise ?? 0) : 0,
            balanceAfterPaise: target.kind === "prepaid_card" ? target.balancePaise : null,
            actorLabel: "demo admin",
            note: `Issued to ${updated.issuedToName ?? "an employee"} (demo)`,
          }),
          ...txns,
        ]);
        setVouchers(next);
        setFeedback(`Voucher ${voucher.code} issued (demo).`);
        setIssueFor(null);
        setIssueForm({ name: "", phone: "", employeeId: "" });
        return;
      }

      const res = await fetch(`/api/admin/vouchers/${voucher.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setFormError(json?.error ?? "Could not issue the voucher.");
        return;
      }
      setFeedback(`Voucher ${voucher.code} issued.`);
      setIssueFor(null);
      setIssueForm({ name: "", phone: "", employeeId: "" });
      await loadLive();
    } catch {
      setFormError("Could not issue the voucher. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleHistory(voucher: VoucherView) {
    if (expandedId === voucher.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(voucher.id);
    if (mode === "demo") {
      setHistory(listDemoVoucherTransactions().filter((t) => t.voucherId === voucher.id));
      return;
    }
    setHistory([]);
    try {
      const res = await fetch(`/api/admin/vouchers/${voucher.id}`);
      const json = await res.json().catch(() => null);
      if (res.ok && json?.mode === "live") {
        setHistory(json.transactions as VoucherTransaction[]);
      }
    } catch {
      // History stays empty; the voucher row itself is unaffected.
    }
  }

  async function toggleQr(voucher: VoucherView) {
    if (qrFor === voucher.id) {
      setQrFor(null);
      setQrUrl(null);
      return;
    }
    setQrFor(voucher.id);
    setQrUrl(null);
    try {
      const QRCode = (await import("qrcode")).default;
      setQrUrl(await QRCode.toDataURL(voucher.code, { width: 180, margin: 1 }));
    } catch {
      setQrUrl(null); // The code text below is the fallback.
    }
  }

  if (loading) {
    return (
      <div className="mt-8 grid items-start gap-8 lg:grid-cols-[380px_1fr]" aria-label="Loading vouchers">
        <div className="rounded-2xl border border-brand-100 p-4 sm:p-6">
          <Skeleton className="h-5 w-36" />
          <SkeletonText lines={2} className="mt-3" />
          <div className="mt-4 grid gap-4">
            {[0, 1, 2].map((field) => (
              <div key={field}>
                <Skeleton className="h-4 w-24" />
                <Skeleton className="mt-1.5 h-11 w-full rounded-xl" />
              </div>
            ))}
          </div>
          <Skeleton className="mt-5 h-11 w-full rounded-full" />
        </div>
        <ul className="grid gap-4">
          {[0, 1, 2, 3].map((row) => (
            <li key={row} className="rounded-2xl border border-brand-100 p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <Skeleton className="h-5 w-44 max-w-[60%]" />
                <Skeleton className="h-6 w-20 rounded-full" />
              </div>
              <SkeletonText lines={2} className="mt-3" />
            </li>
          ))}
        </ul>
      </div>
    );
  }
  if (loadError) {
    return (
      <p role="alert" className="mt-8 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-800">
        {loadError}
      </p>
    );
  }

  return (
    <div className="mt-8 grid items-start gap-8 lg:grid-cols-[380px_1fr]">
      <form
        onSubmit={(e) => void submitCreate(e)}
        noValidate
        className="rounded-2xl border border-brand-100 p-4 sm:p-6"
      >
        <h2 className="font-bold text-ink-900">Create vouchers</h2>
        <p className="mt-1.5 text-sm leading-relaxed text-ink-500">
          A batch shares the same terms; every code is unique. New
          vouchers start as <strong>created</strong> — issue one before a
          customer can use it.
        </p>

        <div className="mt-4 grid gap-4">
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Voucher kind">
            {(
              [
                { value: "prepaid_card", label: "Gift card (prepaid)" },
                { value: "promo", label: "Promo voucher" },
              ] as const
            ).map((opt) => (
              <button
                key={opt.value}
                type="button"
                role="radio"
                aria-checked={form.kind === opt.value}
                onClick={() => setForm((f) => ({ ...f, kind: opt.value }))}
                className={`min-h-[44px] rounded-xl border px-3 py-2 text-sm font-semibold ${
                  form.kind === opt.value
                    ? "border-brand-600 bg-brand-600 text-white"
                    : "border-brand-200 text-ink-700 hover:bg-brand-50"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {form.kind === "prepaid_card" ? (
            <label className={labelClass}>
              <span className={labelTextClass}>Face value (₹)</span>
              <input
                type="number" min={1} step="1" inputMode="decimal"
                value={form.faceValueInr}
                onChange={(e) => setForm((f) => ({ ...f, faceValueInr: e.target.value }))}
                placeholder="e.g. 500"
                className={inputClass}
                aria-invalid={!!fieldErrors.faceValuePaise}
              />
              {fieldErrors.faceValuePaise && <span role="alert" className="text-sm text-red-600">{fieldErrors.faceValuePaise}</span>}
            </label>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <label className={labelClass}>
                  <span className={labelTextClass}>Discount type</span>
                  <select
                    value={form.discountType}
                    onChange={(e) => setForm((f) => ({ ...f, discountType: e.target.value as "fixed" | "percent" }))}
                    className={inputClass}
                  >
                    <option value="percent">Percent (%)</option>
                    <option value="fixed">Fixed (₹)</option>
                  </select>
                </label>
                <label className={labelClass}>
                  <span className={labelTextClass}>{form.discountType === "percent" ? "Percent off" : "Amount off (₹)"}</span>
                  <input
                    type="number" min={1} step="1" inputMode="decimal"
                    value={form.discountValue}
                    onChange={(e) => setForm((f) => ({ ...f, discountValue: e.target.value }))}
                    placeholder={form.discountType === "percent" ? "e.g. 10" : "e.g. 100"}
                    className={inputClass}
                    aria-invalid={!!fieldErrors.discountValue}
                  />
                  {fieldErrors.discountValue && <span role="alert" className="text-sm text-red-600">{fieldErrors.discountValue}</span>}
                </label>
              </div>
              <label className={labelClass}>
                <span className={labelTextClass}>Maximum discount (₹, optional)</span>
                <input
                  type="number" min={0} step="1" inputMode="decimal"
                  value={form.maxDiscountInr}
                  onChange={(e) => setForm((f) => ({ ...f, maxDiscountInr: e.target.value }))}
                  placeholder="No cap"
                  className={inputClass}
                />
              </label>
              <label className={labelClass}>
                <span className={labelTextClass}>Usage limit (per code)</span>
                <input
                  type="number" min={1} step="1"
                  value={form.usageLimit}
                  onChange={(e) => setForm((f) => ({ ...f, usageLimit: e.target.value }))}
                  className={inputClass}
                />
              </label>
            </>
          )}

          <div className="grid grid-cols-2 gap-3">
            <label className={labelClass}>
              <span className={labelTextClass}>Minimum order (₹)</span>
              <input
                type="number" min={0} step="1" inputMode="decimal"
                value={form.minOrderInr}
                onChange={(e) => setForm((f) => ({ ...f, minOrderInr: e.target.value }))}
                placeholder="0 = no minimum"
                className={inputClass}
              />
            </label>
            <label className={labelClass}>
              <span className={labelTextClass}>Quantity (1–50)</span>
              <input
                type="number" min={1} max={50} step="1"
                value={form.quantity}
                onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))}
                className={inputClass}
              />
            </label>
          </div>

          <fieldset>
            <legend className={labelTextClass + " text-sm"}>Eligible services (none ticked = all)</legend>
            <div className="mt-2 grid max-h-44 gap-1.5 overflow-y-auto pr-1">
              {services.map((s) => (
                <label key={s.slug} className="flex items-center gap-2.5 text-sm text-ink-700">
                  <input
                    type="checkbox"
                    checked={form.eligibleServices.includes(s.slug)}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        eligibleServices: e.target.checked
                          ? [...f.eligibleServices, s.slug]
                          : f.eligibleServices.filter((x) => x !== s.slug),
                      }))
                    }
                    className="h-5 w-5 shrink-0 accent-brand-600"
                  />
                  {s.name}
                </label>
              ))}
            </div>
          </fieldset>

          <label className={labelClass}>
            <span className={labelTextClass}>Restrict to branch (optional)</span>
            <select
              value={form.branchId}
              onChange={(e) => setForm((f) => ({ ...f, branchId: e.target.value }))}
              className={inputClass}
            >
              <option value="">All branches</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className={labelClass}>
              <span className={labelTextClass}>Valid from</span>
              <input
                type="date"
                value={form.validFrom}
                onChange={(e) => setForm((f) => ({ ...f, validFrom: e.target.value }))}
                className={inputClass}
              />
            </label>
            <label className={labelClass}>
              <span className={labelTextClass}>Valid until</span>
              <input
                type="date"
                value={form.validUntil}
                onChange={(e) => setForm((f) => ({ ...f, validUntil: e.target.value }))}
                className={inputClass}
                aria-invalid={!!fieldErrors.validUntil}
              />
              {fieldErrors.validUntil && <span role="alert" className="text-sm text-red-600">{fieldErrors.validUntil}</span>}
            </label>
          </div>
        </div>

        {feedback && (
          <p role="status" className="mt-4 rounded-xl bg-green-50 p-3 text-sm font-semibold text-green-800">{feedback}</p>
        )}
        {formError && (
          <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-800">{formError}</p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="btn-press mt-5 min-h-[44px] w-full rounded-full bg-brand-600 px-6 py-3 text-sm font-bold text-white hover:bg-brand-700 disabled:opacity-60"
        >
          {busy ? "Creating…" : "Create voucher(s)"}
        </button>
      </form>

      <div className="min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-bold text-ink-900">
            Vouchers <span className="font-semibold text-ink-500">({filtered.length} of {vouchers.length})</span>
          </h2>
          <select
            aria-label="Filter by status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="min-h-[44px] rounded-full border border-brand-200 bg-white px-4 py-2.5 text-sm font-semibold text-ink-700"
          >
            <option value="ALL">All statuses</option>
            {VOUCHER_STATUSES.map((s) => (
              <option key={s} value={s}>{s.replaceAll("_", " ")}</option>
            ))}
          </select>
        </div>

        {filtered.length === 0 ? (
          <p className="mt-6 rounded-2xl border border-brand-100 p-6 text-sm text-ink-500">
            No vouchers match this filter yet. Create the first batch with the form.
          </p>
        ) : (
          <ul className="mt-4 grid gap-4">
            {filtered.map((v) => (
              <li key={v.id} className="rounded-2xl border border-brand-100 p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-mono text-base font-bold tracking-wide text-ink-900">{v.code}</p>
                    <p className="mt-0.5 text-sm text-ink-500">
                      {v.kind === "prepaid_card" ? "Gift card" : "Promo voucher"} · {valueSummary(v)}
                    </p>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-bold ${STATUS_STYLES[v.status]}`}>
                    {v.status.replaceAll("_", " ")}
                  </span>
                </div>

                <dl className="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                  <div className="flex justify-between gap-3 sm:justify-start"><dt className="text-ink-500">Validity</dt><dd className="font-semibold text-ink-900">{validitySummary(v)}</dd></div>
                  <div className="flex justify-between gap-3 sm:justify-start"><dt className="text-ink-500">Min order</dt><dd className="font-semibold text-ink-900">{v.minOrderPaise > 0 ? formatPaise(v.minOrderPaise) : "None"}</dd></div>
                  <div className="flex justify-between gap-3 sm:justify-start"><dt className="text-ink-500">Issued to</dt><dd className="font-semibold text-ink-900">{v.issuedToName ?? "—"}{v.issuedToPhone ? ` · ${v.issuedToPhone}` : ""}</dd></div>
                  <div className="flex justify-between gap-3 sm:justify-start"><dt className="text-ink-500">Used</dt><dd className="font-semibold text-ink-900">{v.kind === "promo" ? `${v.timesUsed} / ${v.usageLimit}` : "—"}</dd></div>
                  {v.branchName && (
                    <div className="flex justify-between gap-3 sm:justify-start"><dt className="text-ink-500">Branch</dt><dd className="font-semibold text-ink-900">{v.branchName}</dd></div>
                  )}
                  {v.eligibleServices.length > 0 && (
                    <div className="flex justify-between gap-3 sm:justify-start"><dt className="text-ink-500">Services</dt><dd className="font-semibold text-ink-900">{v.eligibleServices.length} selected</dd></div>
                  )}
                </dl>

                <div className="mt-4 flex flex-wrap gap-2">
                  {v.status === "created" && (
                    <button
                      type="button"
                      onClick={() => { setIssueFor(issueFor === v.id ? null : v.id); setFormError(null); }}
                      className="btn-press min-h-[44px] rounded-full bg-brand-600 px-4 py-2 text-sm font-bold text-white hover:bg-brand-700"
                    >
                      Issue…
                    </button>
                  )}
                  {!TERMINAL.has(v.status) && (
                    <>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void runAction(v, "expire")}
                        className="min-h-[44px] rounded-full border border-brand-200 px-4 py-2 text-sm font-semibold text-ink-700 hover:bg-brand-50 disabled:opacity-60"
                      >
                        Mark expired
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void runAction(v, "cancel")}
                        className="min-h-[44px] rounded-full border border-red-200 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60"
                      >
                        Cancel
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => void toggleQr(v)}
                    className="min-h-[44px] rounded-full border border-brand-200 px-4 py-2 text-sm font-semibold text-ink-700 hover:bg-brand-50"
                  >
                    {qrFor === v.id ? "Hide QR" : "Show QR"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void toggleHistory(v)}
                    className="min-h-[44px] rounded-full border border-brand-200 px-4 py-2 text-sm font-semibold text-ink-700 hover:bg-brand-50"
                  >
                    {expandedId === v.id ? "Hide history" : "History"}
                  </button>
                </div>

                {qrFor === v.id && (
                  <div className="mt-4 flex flex-wrap items-center gap-4 rounded-xl bg-brand-50 p-4">
                    {qrUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={qrUrl} alt={`QR code for voucher ${v.code}`} width={180} height={180} className="rounded-lg bg-white p-1" />
                    ) : (
                      <p className="text-sm text-ink-500">QR could not be rendered in this browser.</p>
                    )}
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">Code (scan or type)</p>
                      <p className="mt-1 font-mono text-lg font-bold text-ink-900">{v.code}</p>
                      <p className="mt-1 max-w-xs text-xs leading-relaxed text-ink-500">
                        The QR encodes exactly this code — the customer enters it at checkout, or the cashier redeems a gift card at the order desk.
                      </p>
                    </div>
                  </div>
                )}

                {issueFor === v.id && v.status === "created" && (
                  <form
                    className="mt-4 grid gap-3 rounded-xl bg-brand-50 p-4 sm:grid-cols-3"
                    onSubmit={(e) => { e.preventDefault(); void submitIssue(v); }}
                  >
                    <label className={labelClass}>
                      <span className={labelTextClass}>Issued to (name)</span>
                      <input
                        value={issueForm.name}
                        onChange={(e) => setIssueForm((f) => ({ ...f, name: e.target.value }))}
                        placeholder="Customer or recipient name"
                        className={inputClass}
                      />
                    </label>
                    <label className={labelClass}>
                      <span className={labelTextClass}>Phone (optional)</span>
                      <input
                        value={issueForm.phone}
                        onChange={(e) => setIssueForm((f) => ({ ...f, phone: e.target.value }))}
                        placeholder="10-digit mobile"
                        className={inputClass}
                      />
                    </label>
                    <label className={labelClass}>
                      <span className={labelTextClass}>…or employee</span>
                      <select
                        value={issueForm.employeeId}
                        onChange={(e) => setIssueForm((f) => ({ ...f, employeeId: e.target.value }))}
                        className={inputClass}
                      >
                        <option value="">Not an employee</option>
                        {employees.map((emp) => (
                          <option key={emp.id} value={emp.id}>{emp.fullName} ({emp.employeeCode})</option>
                        ))}
                      </select>
                    </label>
                    <div className="sm:col-span-3">
                      <button
                        type="submit"
                        disabled={busy}
                        className="btn-press min-h-[44px] rounded-full bg-brand-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-brand-700 disabled:opacity-60"
                      >
                        {busy ? "Issuing…" : "Issue voucher"}
                      </button>
                    </div>
                  </form>
                )}

                {expandedId === v.id && (
                  <div className="mt-4 rounded-xl bg-brand-50 p-4">
                    <h3 className="text-sm font-bold text-ink-900">Transaction history</h3>
                    {history.length === 0 ? (
                      <p className="mt-2 text-sm text-ink-500">No transactions recorded yet.</p>
                    ) : (
                      <ul className="mt-2 grid gap-2">
                        {history.map((t) => (
                          <li key={t.id} className="flex flex-wrap items-baseline justify-between gap-2 border-b border-brand-100 pb-2 text-sm last:border-0 last:pb-0">
                            <span className="font-semibold text-ink-900">
                              {t.txnType}
                              {t.amountPaise > 0 ? ` · ${formatPaise(t.amountPaise)}` : ""}
                              {t.balanceAfterPaise !== null ? ` · balance after ${formatPaise(t.balanceAfterPaise)}` : ""}
                            </span>
                            <span className="text-xs text-ink-500">
                              {new Date(t.createdAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                              {t.actorLabel ? ` · ${t.actorLabel}` : ""}
                            </span>
                            {t.note && <span className="w-full text-xs text-ink-500">{t.note}</span>}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
