"use client";

import { useCallback, useEffect, useState } from "react";
import { Skeleton, SkeletonText } from "@/components/Skeleton";
import {
  BRANCH_TYPES,
  branchTypeLabel,
  validateBranchForm,
  type Branch,
  type BranchType,
  type Employee,
} from "@/lib/org";
import {
  listDemoBranches,
  listDemoEmployees,
  saveDemoBranches,
} from "@/lib/demo-org";

/**
 * Branches / plants / collection centers manager (Phase 7a).
 *
 * Live mode talks to /api/admin/branches (+ /api/admin/employees for
 * the manager picker); demo mode runs on this browser's demo org
 * store under the layout's DEMO MODE banner. Cards on mobile, a table
 * on desktop, 44px touch targets throughout — the Phase 6/B admin
 * responsive conventions.
 */

const inputClass =
  "min-h-[44px] w-full rounded-xl border border-brand-200 px-3 py-2.5 text-sm text-ink-900 placeholder:text-ink-500/70 focus:border-brand-500 focus:outline-none";
const labelClass = "grid gap-1.5 text-sm";
const labelTextClass = "font-semibold text-ink-900";

interface BranchFormState {
  name: string;
  type: BranchType;
  address: string;
  area: string;
  pincode: string;
  managerEmployeeId: string;
  active: boolean;
}

const EMPTY_FORM: BranchFormState = {
  name: "",
  type: "collection_center",
  address: "",
  area: "",
  pincode: "",
  managerEmployeeId: "",
  active: true,
};

export default function AdminBranches({ mode }: { mode: "live" | "demo" }) {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  // editingId: null = form closed, "new" = creating, otherwise the id.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<BranchFormState>(EMPTY_FORM);

  const loadLive = useCallback(async () => {
    try {
      const [bRes, eRes] = await Promise.all([
        fetch("/api/admin/branches"),
        fetch("/api/admin/employees"),
      ]);
      const bJson = await bRes.json().catch(() => null);
      if (!bRes.ok || !bJson || bJson.mode !== "live") {
        setLoadError(bJson?.error ?? "Could not load branches.");
        return;
      }
      setBranches(bJson.branches as Branch[]);
      const eJson = await eRes.json().catch(() => null);
      if (eRes.ok && eJson?.mode === "live") {
        setEmployees(eJson.employees as Employee[]);
      }
    } catch {
      setLoadError("Could not load branches.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadDemo = useCallback(() => {
    setBranches(listDemoBranches());
    setEmployees(listDemoEmployees());
    setLoading(false);
  }, []);

  useEffect(() => {
    if (mode === "live") void loadLive();
    else loadDemo();
  }, [mode, loadLive, loadDemo]);

  function managerName(branch: Branch): string | null {
    if (branch.managerEmployeeId) {
      const found = employees.find((e) => e.id === branch.managerEmployeeId);
      if (found) return found.fullName;
    }
    return ("managerName" in branch ? (branch as Branch & { managerName?: string | null }).managerName : null) ?? null;
  }

  function openCreate() {
    setForm(EMPTY_FORM);
    setFieldErrors({});
    setFormError(null);
    setEditingId("new");
  }

  function openEdit(branch: Branch) {
    setForm({
      name: branch.name,
      type: branch.type,
      address: branch.address ?? "",
      area: branch.area ?? "",
      pincode: branch.pincode ?? "",
      managerEmployeeId: branch.managerEmployeeId ?? "",
      active: branch.active,
    });
    setFieldErrors({});
    setFormError(null);
    setEditingId(branch.id);
  }

  async function saveDemo(next: Branch[]) {
    saveDemoBranches(next);
    setBranches(next);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setFeedback(null);

    const validation = validateBranchForm({
      name: form.name,
      type: form.type,
      pincode: form.pincode,
    });
    if (!validation.ok) {
      setFieldErrors(validation.errors);
      return;
    }
    setFieldErrors({});
    setBusy(true);
    try {
      const payload = {
        name: form.name.trim(),
        type: form.type,
        address: form.address.trim(),
        area: form.area.trim(),
        pincode: form.pincode.trim(),
        managerEmployeeId: form.managerEmployeeId || null,
        active: form.active,
      };

      if (mode === "demo") {
        if (editingId === "new") {
          const branch: Branch = {
            id: `demo-branch-${Date.now()}`,
            name: payload.name,
            type: payload.type,
            address: payload.address || null,
            area: payload.area || null,
            pincode: payload.pincode || null,
            managerEmployeeId: payload.managerEmployeeId,
            active: payload.active,
            createdAt: new Date().toISOString(),
          };
          await saveDemo([...branches, branch]);
          setFeedback("Demo branch added — saved in this browser only.");
        } else if (editingId) {
          await saveDemo(
            branches.map((b) =>
              b.id === editingId
                ? {
                    ...b,
                    name: payload.name,
                    type: payload.type,
                    address: payload.address || null,
                    area: payload.area || null,
                    pincode: payload.pincode || null,
                    managerEmployeeId: payload.managerEmployeeId,
                    active: payload.active,
                  }
                : b,
            ),
          );
          setFeedback("Demo branch updated — saved in this browser only.");
        }
        setEditingId(null);
        return;
      }

      const res = await fetch(
        editingId === "new" ? "/api/admin/branches" : `/api/admin/branches/${editingId}`,
        {
          method: editingId === "new" ? "POST" : "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setFormError(json?.error ?? "Could not save the branch.");
        return;
      }
      setFeedback(editingId === "new" ? "Branch added." : "Branch updated.");
      setEditingId(null);
      await loadLive();
    } catch {
      setFormError("Could not save the branch. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(branch: Branch) {
    setFeedback(null);
    setFormError(null);
    if (mode === "demo") {
      await saveDemo(
        branches.map((b) => (b.id === branch.id ? { ...b, active: !b.active } : b)),
      );
      setFeedback(`Demo branch ${branch.active ? "deactivated" : "activated"}.`);
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/branches/${branch.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !branch.active }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setFormError(json?.error ?? "Could not update the branch.");
        return;
      }
      setFeedback(`Branch ${branch.active ? "deactivated" : "activated"}.`);
      await loadLive();
    } catch {
      setFormError("Could not update the branch. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-bold text-ink-900">
          Units {loading ? "" : `(${branches.length})`}
        </h2>
        <button
          type="button"
          onClick={openCreate}
          className="btn-press min-h-[44px] w-full rounded-full bg-brand-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-brand-700 sm:w-auto"
        >
          Add a unit
        </button>
      </div>

      {feedback && (
        <p role="status" className="mt-4 rounded-xl bg-green-50 p-3 text-sm font-semibold text-green-800">
          {feedback}
        </p>
      )}
      {formError && editingId === null && (
        <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-800">
          {formError}
        </p>
      )}
      {loadError && (
        <p role="alert" className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-800">
          {loadError}
        </p>
      )}

      {editingId !== null && (
        <form
          onSubmit={handleSubmit}
          className="mt-6 grid gap-4 rounded-2xl border border-brand-100 p-4 sm:grid-cols-2 sm:p-6"
        >
          <h3 className="font-bold text-ink-900 sm:col-span-2">
            {editingId === "new" ? "Add a unit" : "Edit unit"}
          </h3>
          {formError && (
            <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-800 sm:col-span-2">
              {formError}
            </p>
          )}
          <label className={labelClass}>
            <span className={labelTextClass}>Name</span>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Sector 4 Collection Center"
              className={inputClass}
            />
            {fieldErrors.name && <span className="text-xs font-semibold text-red-700">{fieldErrors.name}</span>}
          </label>
          <label className={labelClass}>
            <span className={labelTextClass}>Type</span>
            <select
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value as BranchType })}
              className={inputClass}
            >
              {BRANCH_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
            {fieldErrors.type && <span className="text-xs font-semibold text-red-700">{fieldErrors.type}</span>}
          </label>
          <label className={labelClass}>
            <span className={labelTextClass}>Address</span>
            <input
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              placeholder="Street address"
              className={inputClass}
            />
          </label>
          <label className={labelClass}>
            <span className={labelTextClass}>Area</span>
            <input
              value={form.area}
              onChange={(e) => setForm({ ...form, area: e.target.value })}
              placeholder="e.g. Sector 4 / City Centre"
              className={inputClass}
            />
          </label>
          <label className={labelClass}>
            <span className={labelTextClass}>Pincode</span>
            <input
              value={form.pincode}
              onChange={(e) => setForm({ ...form, pincode: e.target.value })}
              inputMode="numeric"
              placeholder="827004"
              className={inputClass}
            />
            {fieldErrors.pincode && <span className="text-xs font-semibold text-red-700">{fieldErrors.pincode}</span>}
          </label>
          <label className={labelClass}>
            <span className={labelTextClass}>Manager (optional)</span>
            <select
              value={form.managerEmployeeId}
              onChange={(e) => setForm({ ...form, managerEmployeeId: e.target.value })}
              className={inputClass}
            >
              <option value="">No manager assigned</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.fullName} ({emp.employeeCode})
                </option>
              ))}
            </select>
            {employees.length === 0 && (
              <span className="text-xs text-ink-500">
                Add employees first — then a manager can be assigned here.
              </span>
            )}
          </label>
          <label className="flex items-start gap-2.5 text-sm text-ink-700 sm:col-span-2">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) => setForm({ ...form, active: e.target.checked })}
              className="mt-0.5 h-5 w-5 shrink-0 accent-brand-600"
            />
            <span>Active — this unit can receive work</span>
          </label>
          <div className="flex flex-col gap-2 sm:col-span-2 sm:flex-row">
            <button
              type="submit"
              disabled={busy}
              className="btn-press min-h-[44px] w-full rounded-full bg-brand-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-brand-700 disabled:opacity-60 sm:w-auto"
            >
              {busy ? "Saving…" : editingId === "new" ? "Add unit" : "Save changes"}
            </button>
            <button
              type="button"
              onClick={() => setEditingId(null)}
              className="min-h-[44px] w-full rounded-full border border-brand-200 px-5 py-2.5 text-sm font-bold text-ink-700 hover:bg-brand-50 sm:w-auto"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <ul className="mt-6 grid gap-3" aria-label="Loading units">
          {[0, 1, 2, 3].map((row) => (
            <li key={row} className="rounded-2xl border border-brand-100 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Skeleton className="h-5 w-40 max-w-[55%]" />
                <Skeleton className="h-6 w-20 rounded-full" />
              </div>
              <SkeletonText lines={2} className="mt-3" />
            </li>
          ))}
        </ul>
      ) : branches.length === 0 ? (
        <p className="mt-6 text-sm leading-relaxed text-ink-500">
          No units yet. Add the laundry plant and your first collection
          center to start assigning employees.
        </p>
      ) : (
        <>
          {/* Mobile cards */}
          <ul className="mt-6 grid gap-3 md:hidden">
            {branches.map((b) => (
              <li key={b.id} className="rounded-2xl border border-brand-100 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-bold text-ink-900">{b.name}</p>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-bold ${
                      b.active
                        ? "bg-green-50 text-green-800"
                        : "bg-ink-500/10 text-ink-500"
                    }`}
                  >
                    {b.active ? "Active" : "Inactive"}
                  </span>
                </div>
                <p className="mt-2 text-sm text-ink-500">
                  {branchTypeLabel(b.type)}
                  {b.area ? ` · ${b.area}` : ""}
                  {b.pincode ? ` — ${b.pincode}` : ""}
                </p>
                <p className="text-sm text-ink-500">
                  Manager: {managerName(b) ?? "Not assigned"}
                </p>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => openEdit(b)}
                    className="min-h-[44px] flex-1 rounded-full border border-brand-200 px-4 py-2 text-sm font-bold text-ink-700 hover:bg-brand-50"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void toggleActive(b)}
                    className="min-h-[44px] flex-1 rounded-full border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-bold text-amber-900 hover:bg-amber-100 disabled:opacity-60"
                  >
                    {b.active ? "Deactivate" : "Activate"}
                  </button>
                </div>
              </li>
            ))}
          </ul>

          {/* Desktop table */}
          <div className="mt-6 hidden overflow-x-auto rounded-2xl border border-brand-100 md:block">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-brand-100 bg-brand-50/60 text-ink-700">
                  <th className="px-4 py-3 font-bold">Name</th>
                  <th className="px-4 py-3 font-bold">Type</th>
                  <th className="px-4 py-3 font-bold">Area · Pincode</th>
                  <th className="px-4 py-3 font-bold">Manager</th>
                  <th className="px-4 py-3 font-bold">Status</th>
                  <th className="px-4 py-3 font-bold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {branches.map((b) => (
                  <tr key={b.id} className="border-b border-brand-50 last:border-0">
                    <td className="px-4 py-3 font-semibold text-ink-900">{b.name}</td>
                    <td className="px-4 py-3 text-ink-700">{branchTypeLabel(b.type)}</td>
                    <td className="px-4 py-3 text-ink-700">
                      {b.area ?? "—"}
                      {b.pincode ? ` · ${b.pincode}` : ""}
                    </td>
                    <td className="px-4 py-3 text-ink-700">{managerName(b) ?? "—"}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-bold ${
                          b.active
                            ? "bg-green-50 text-green-800"
                            : "bg-ink-500/10 text-ink-500"
                        }`}
                      >
                        {b.active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => openEdit(b)}
                          className="min-h-[44px] rounded-full border border-brand-200 px-4 py-2 text-sm font-bold text-ink-700 hover:bg-brand-50"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void toggleActive(b)}
                          className="min-h-[44px] rounded-full border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-bold text-amber-900 hover:bg-amber-100 disabled:opacity-60"
                        >
                          {b.active ? "Deactivate" : "Activate"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
