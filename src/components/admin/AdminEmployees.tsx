"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Skeleton, SkeletonText } from "@/components/Skeleton";
import {
  STAFF_ROLES,
  staffRoleLabel,
  suggestNextEmployeeCode,
  validateEmployeeForm,
  type Branch,
  type Employee,
  type EmploymentStatus,
  type StaffRole,
} from "@/lib/org";
import {
  listDemoBranches,
  listDemoEmployees,
  saveDemoEmployees,
  withDemoNames,
} from "@/lib/demo-org";

/**
 * Employee management (Phase 7a — Requirements v2 §3).
 *
 * One screen for every stage of the workflow: create/edit employees,
 * assign one or more of the 12 staff roles, place them in a branch /
 * plant / collection center, set their reporting manager, and
 * activate/deactivate. Live mode uses /api/admin/employees (every
 * mutation audit-logged server-side); demo mode runs on this
 * browser's demo org store under the DEMO MODE banner.
 */

const inputClass =
  "min-h-[44px] w-full rounded-xl border border-brand-200 px-3 py-2.5 text-sm text-ink-900 placeholder:text-ink-500/70 focus:border-brand-500 focus:outline-none";
const selectClass =
  "min-h-[44px] w-full rounded-full border border-brand-200 bg-white px-4 py-2.5 text-sm font-semibold text-ink-700 lg:w-auto";
const labelClass = "grid gap-1.5 text-sm";
const labelTextClass = "font-semibold text-ink-900";

interface EmployeeFormState {
  fullName: string;
  employeeCode: string;
  phone: string;
  email: string;
  roles: StaffRole[];
  branchId: string;
  managerId: string;
  joiningDate: string;
  employmentStatus: EmploymentStatus;
}

const EMPTY_FORM: EmployeeFormState = {
  fullName: "",
  employeeCode: "",
  phone: "",
  email: "",
  roles: [],
  branchId: "",
  managerId: "",
  joiningDate: "",
  employmentStatus: "active",
};

export default function AdminEmployees({ mode }: { mode: "live" | "demo" }) {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const [branchFilter, setBranchFilter] = useState("ALL");
  const [roleFilter, setRoleFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [search, setSearch] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<EmployeeFormState>(EMPTY_FORM);
  // Staff Web App invite (Staff Web App phase) — which employee's
  // invite is in flight, if any.
  const [inviteBusyId, setInviteBusyId] = useState<string | null>(null);

  const loadLive = useCallback(async () => {
    try {
      const [eRes, bRes] = await Promise.all([
        fetch("/api/admin/employees"),
        fetch("/api/admin/branches"),
      ]);
      const eJson = await eRes.json().catch(() => null);
      if (!eRes.ok || !eJson || eJson.mode !== "live") {
        setLoadError(eJson?.error ?? "Could not load employees.");
        return;
      }
      setEmployees(eJson.employees as Employee[]);
      const bJson = await bRes.json().catch(() => null);
      if (bRes.ok && bJson?.mode === "live") {
        setBranches(bJson.branches as Branch[]);
      }
    } catch {
      setLoadError("Could not load employees.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadDemo = useCallback(() => {
    const demoBranches = listDemoBranches();
    setBranches(demoBranches);
    setEmployees(withDemoNames(listDemoEmployees(), demoBranches));
    setLoading(false);
  }, []);

  useEffect(() => {
    if (mode === "live") void loadLive();
    else loadDemo();
  }, [mode, loadLive, loadDemo]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return employees.filter((e) => {
      if (branchFilter !== "ALL" && e.branchId !== branchFilter) return false;
      if (roleFilter !== "ALL" && !e.roles.includes(roleFilter as StaffRole)) return false;
      if (statusFilter !== "ALL" && e.employmentStatus !== statusFilter) return false;
      if (q) {
        const hay = `${e.fullName} ${e.employeeCode} ${e.phone} ${e.email ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [employees, branchFilter, roleFilter, statusFilter, search]);

  function openCreate() {
    setForm({
      ...EMPTY_FORM,
      employeeCode: suggestNextEmployeeCode(employees.map((e) => e.employeeCode)),
    });
    setFieldErrors({});
    setFormError(null);
    setEditingId("new");
  }

  function openEdit(emp: Employee) {
    setForm({
      fullName: emp.fullName,
      employeeCode: emp.employeeCode,
      phone: emp.phone,
      email: emp.email ?? "",
      roles: [...emp.roles],
      branchId: emp.branchId ?? "",
      managerId: emp.managerId ?? "",
      joiningDate: emp.joiningDate ?? "",
      employmentStatus: emp.employmentStatus,
    });
    setFieldErrors({});
    setFormError(null);
    setEditingId(emp.id);
  }

  function toggleRole(role: StaffRole) {
    setForm((f) => ({
      ...f,
      roles: f.roles.includes(role)
        ? f.roles.filter((r) => r !== role)
        : [...f.roles, role],
    }));
  }

  async function persistDemo(next: Employee[]) {
    const named = withDemoNames(next, branches);
    saveDemoEmployees(named);
    setEmployees(named);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setFeedback(null);

    const validation = validateEmployeeForm({
      fullName: form.fullName,
      phone: form.phone,
      email: form.email,
      employeeCode: form.employeeCode,
      roles: form.roles,
      joiningDate: form.joiningDate,
      employmentStatus: form.employmentStatus,
    });
    if (!validation.ok) {
      setFieldErrors(validation.errors);
      return;
    }
    setFieldErrors({});
    setBusy(true);
    try {
      const payload = {
        fullName: form.fullName.trim(),
        employeeCode: form.employeeCode.trim().toUpperCase(),
        phone: form.phone.trim(),
        email: form.email.trim(),
        roles: form.roles,
        branchId: form.branchId || null,
        managerId: form.managerId || null,
        joiningDate: form.joiningDate,
        employmentStatus: form.employmentStatus,
      };

      if (mode === "demo") {
        if (editingId === "new") {
          const emp: Employee = {
            id: `demo-emp-${Date.now()}`,
            employeeCode: payload.employeeCode,
            fullName: payload.fullName,
            phone: payload.phone,
            email: payload.email || null,
            userId: null,
            branchId: payload.branchId,
            branchName: null,
            managerId: payload.managerId,
            managerName: null,
            employmentStatus: payload.employmentStatus,
            joiningDate: payload.joiningDate || null,
            roles: payload.roles,
            createdAt: new Date().toISOString(),
          };
          await persistDemo([emp, ...employees]);
          setFeedback("Demo employee added — saved in this browser only.");
        } else if (editingId) {
          await persistDemo(
            employees.map((emp) =>
              emp.id === editingId
                ? {
                    ...emp,
                    employeeCode: payload.employeeCode,
                    fullName: payload.fullName,
                    phone: payload.phone,
                    email: payload.email || null,
                    branchId: payload.branchId,
                    managerId: payload.managerId,
                    employmentStatus: payload.employmentStatus,
                    joiningDate: payload.joiningDate || null,
                    roles: payload.roles,
                  }
                : emp,
            ),
          );
          setFeedback("Demo employee updated — saved in this browser only.");
        }
        setEditingId(null);
        return;
      }

      const res = await fetch(
        editingId === "new" ? "/api/admin/employees" : `/api/admin/employees/${editingId}`,
        {
          method: editingId === "new" ? "POST" : "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setFormError(json?.error ?? "Could not save the employee.");
        return;
      }
      setFeedback(editingId === "new" ? "Employee added." : "Employee updated.");
      setEditingId(null);
      await loadLive();
    } catch {
      setFormError("Could not save the employee. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleStatus(emp: Employee) {
    setFeedback(null);
    setFormError(null);
    const next: EmploymentStatus = emp.employmentStatus === "active" ? "inactive" : "active";
    if (mode === "demo") {
      await persistDemo(
        employees.map((e) => (e.id === emp.id ? { ...e, employmentStatus: next } : e)),
      );
      setFeedback(`Demo employee ${next === "active" ? "activated" : "deactivated"}.`);
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/employees/${emp.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employmentStatus: next }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setFormError(json?.error ?? "Could not update the employee.");
        return;
      }
      setFeedback(`Employee ${next === "active" ? "activated" : "deactivated"}.`);
      await loadLive();
    } catch {
      setFormError("Could not update the employee. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  /**
   * Staff app access (Staff Web App phase): invite POSTs to
   * /api/admin/employees/[id]/invite, which emails the employee a
   * set-password link and links their account (role 'staff'). The
   * three honest states: linked (nothing to do), no email on file
   * (cannot invite — say so), or invitable.
   */
  async function inviteToStaffApp(emp: Employee) {
    setFeedback(null);
    setFormError(null);
    setInviteBusyId(emp.id);
    try {
      const res = await fetch(`/api/admin/employees/${emp.id}/invite`, {
        method: "POST",
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setFormError(json?.error ?? "Could not send the staff app invite.");
        return;
      }
      setFeedback(
        json?.message ?? `${emp.fullName} has been invited to the staff app.`,
      );
      await loadLive();
    } catch {
      setFormError("Could not send the staff app invite. Please try again.");
    } finally {
      setInviteBusyId(null);
    }
  }

  function staffAppAction(emp: Employee) {
    if (mode !== "live") return null;
    if (emp.userId) {
      return (
        <span className="inline-flex min-h-[44px] items-center rounded-full bg-green-50 px-4 py-2 text-sm font-bold text-green-800">
          Staff app linked
        </span>
      );
    }
    if (!emp.email) {
      return (
        <span
          className="inline-flex min-h-[44px] items-center rounded-full bg-ink-500/10 px-4 py-2 text-sm font-bold text-ink-500"
          title="Add an email address to this employee (Edit) before inviting them."
        >
          Invite needs an email
        </span>
      );
    }
    return (
      <button
        type="button"
        disabled={inviteBusyId === emp.id}
        onClick={() => void inviteToStaffApp(emp)}
        className="min-h-[44px] rounded-full border border-brand-600 px-4 py-2 text-sm font-bold text-brand-700 hover:bg-brand-50 disabled:opacity-60"
      >
        {inviteBusyId === emp.id ? "Inviting…" : "Invite to staff app"}
      </button>
    );
  }

  function statusPill(emp: Employee) {
    return (
      <span
        className={`rounded-full px-3 py-1 text-xs font-bold ${
          emp.employmentStatus === "active"
            ? "bg-green-50 text-green-800"
            : "bg-ink-500/10 text-ink-500"
        }`}
      >
        {emp.employmentStatus === "active" ? "Active" : "Inactive"}
      </span>
    );
  }

  function roleChips(emp: Employee) {
    return (
      <span className="flex flex-wrap gap-1.5">
        {emp.roles.map((r) => (
          <span
            key={r}
            className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-bold text-brand-700"
          >
            {staffRoleLabel(r)}
          </span>
        ))}
      </span>
    );
  }

  const managerOptions = employees.filter((e) => e.id !== editingId);

  return (
    <div className="mt-8">
      <div className="grid gap-3 sm:grid-cols-2 lg:flex lg:flex-wrap lg:items-center">
        <label className="sr-only" htmlFor="emp-search">Search employees</label>
        <input
          id="emp-search"
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, code or phone…"
          className="min-h-[44px] w-full rounded-full border border-brand-200 px-4 py-2.5 text-sm text-ink-900 placeholder:text-ink-500/70 focus:border-brand-500 focus:outline-none sm:col-span-2 lg:w-auto lg:flex-1"
        />
        <label className="sr-only" htmlFor="emp-branch">Filter by branch</label>
        <select id="emp-branch" value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)} className={selectClass}>
          <option value="ALL">All units</option>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
        <label className="sr-only" htmlFor="emp-role">Filter by role</label>
        <select id="emp-role" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} className={selectClass}>
          <option value="ALL">All roles</option>
          {STAFF_ROLES.map((r) => (
            <option key={r.role} value={r.role}>{r.label}</option>
          ))}
        </select>
        <label className="sr-only" htmlFor="emp-status">Filter by status</label>
        <select id="emp-status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={selectClass}>
          <option value="ALL">Any status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
        <button
          type="button"
          onClick={openCreate}
          className="btn-press min-h-[44px] w-full rounded-full bg-brand-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-brand-700 sm:col-span-2 lg:w-auto"
        >
          Add employee
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
            {editingId === "new" ? "Add an employee" : "Edit employee"}
          </h3>
          {formError && (
            <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-800 sm:col-span-2">
              {formError}
            </p>
          )}
          <label className={labelClass}>
            <span className={labelTextClass}>Full name</span>
            <input
              value={form.fullName}
              onChange={(e) => setForm({ ...form, fullName: e.target.value })}
              placeholder="e.g. Ramesh Kumar"
              className={inputClass}
            />
            {fieldErrors.fullName && <span className="text-xs font-semibold text-red-700">{fieldErrors.fullName}</span>}
          </label>
          <label className={labelClass}>
            <span className={labelTextClass}>Employee code</span>
            <input
              value={form.employeeCode}
              onChange={(e) => setForm({ ...form, employeeCode: e.target.value })}
              placeholder="ZC-EMP-0001"
              className={inputClass}
            />
            <span className="text-xs text-ink-500">
              Auto-suggested from the last code in use — you can change it.
            </span>
            {fieldErrors.employeeCode && <span className="text-xs font-semibold text-red-700">{fieldErrors.employeeCode}</span>}
          </label>
          <label className={labelClass}>
            <span className={labelTextClass}>Mobile number</span>
            <input
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              inputMode="tel"
              placeholder="98765 43210"
              className={inputClass}
            />
            {fieldErrors.phone && <span className="text-xs font-semibold text-red-700">{fieldErrors.phone}</span>}
          </label>
          <label className={labelClass}>
            <span className={labelTextClass}>Email (optional)</span>
            <input
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              inputMode="email"
              placeholder="name@example.com"
              className={inputClass}
            />
            {fieldErrors.email && <span className="text-xs font-semibold text-red-700">{fieldErrors.email}</span>}
          </label>

          <fieldset className="sm:col-span-2">
            <legend className="text-sm font-semibold text-ink-900">
              Roles — tick every stage this employee may work
            </legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {STAFF_ROLES.map((r) => (
                <label
                  key={r.role}
                  className="flex min-h-[44px] items-center gap-2.5 rounded-xl border border-brand-100 px-3 py-2 text-sm text-ink-700"
                >
                  <input
                    type="checkbox"
                    checked={form.roles.includes(r.role)}
                    onChange={() => toggleRole(r.role)}
                    className="h-5 w-5 shrink-0 accent-brand-600"
                  />
                  <span>
                    <span className="font-semibold text-ink-900">{r.label}</span>
                    <span className="block text-xs text-ink-500">{r.stage}</span>
                  </span>
                </label>
              ))}
            </div>
            {fieldErrors.roles && <span className="text-xs font-semibold text-red-700">{fieldErrors.roles}</span>}
          </fieldset>

          <label className={labelClass}>
            <span className={labelTextClass}>Assigned unit</span>
            <select
              value={form.branchId}
              onChange={(e) => setForm({ ...form, branchId: e.target.value })}
              className={inputClass}
            >
              <option value="">Not assigned yet</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </label>
          <label className={labelClass}>
            <span className={labelTextClass}>Reporting manager</span>
            <select
              value={form.managerId}
              onChange={(e) => setForm({ ...form, managerId: e.target.value })}
              className={inputClass}
            >
              <option value="">No manager</option>
              {managerOptions.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.fullName} ({emp.employeeCode})
                </option>
              ))}
            </select>
          </label>
          <label className={labelClass}>
            <span className={labelTextClass}>Joining date</span>
            <input
              type="date"
              value={form.joiningDate}
              onChange={(e) => setForm({ ...form, joiningDate: e.target.value })}
              className={inputClass}
            />
            {fieldErrors.joiningDate && <span className="text-xs font-semibold text-red-700">{fieldErrors.joiningDate}</span>}
          </label>
          <label className={labelClass}>
            <span className={labelTextClass}>Employment status</span>
            <select
              value={form.employmentStatus}
              onChange={(e) => setForm({ ...form, employmentStatus: e.target.value as EmploymentStatus })}
              className={inputClass}
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </label>

          <p className="rounded-xl bg-brand-50 p-3 text-xs leading-relaxed text-ink-700 sm:col-span-2">
            <strong>Login is optional.</strong> An employee record is what
            gives someone staff access — never the customer account type.
            To let this employee sign in, have them register on the site
            with the same email address; the accounts are linked by the
            admin from the database until self-service linking ships.
          </p>

          <div className="flex flex-col gap-2 sm:col-span-2 sm:flex-row">
            <button
              type="submit"
              disabled={busy}
              className="btn-press min-h-[44px] w-full rounded-full bg-brand-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-brand-700 disabled:opacity-60 sm:w-auto"
            >
              {busy ? "Saving…" : editingId === "new" ? "Add employee" : "Save changes"}
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

      <h2 className="mt-8 font-bold text-ink-900">
        Staff {loading ? "" : `(${filtered.length}${filtered.length !== employees.length ? ` of ${employees.length}` : ""})`}
      </h2>
      {loading ? (
        <ul className="mt-4 grid gap-3" aria-label="Loading employees">
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
      ) : filtered.length === 0 ? (
        <p className="mt-3 text-sm leading-relaxed text-ink-500">
          {employees.length === 0
            ? "No employees yet. Add your first employee — a plant manager or a picker is a good start."
            : "No employees match the current filters."}
        </p>
      ) : (
        <>
          {/* Mobile cards */}
          <ul className="mt-4 grid gap-3 md:hidden">
            {filtered.map((emp) => (
              <li key={emp.id} className="rounded-2xl border border-brand-100 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-bold text-ink-900">{emp.fullName}</p>
                  {statusPill(emp)}
                </div>
                <p className="mt-1 text-sm text-ink-500">
                  {emp.employeeCode} · {emp.phone}
                </p>
                <div className="mt-2">{roleChips(emp)}</div>
                <p className="mt-2 text-sm text-ink-500">
                  {emp.branchName ?? "No unit assigned"}
                  {emp.managerName ? ` · Reports to ${emp.managerName}` : ""}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => openEdit(emp)}
                    className="min-h-[44px] flex-1 rounded-full border border-brand-200 px-4 py-2 text-sm font-bold text-ink-700 hover:bg-brand-50"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void toggleStatus(emp)}
                    className="min-h-[44px] flex-1 rounded-full border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-bold text-amber-900 hover:bg-amber-100 disabled:opacity-60"
                  >
                    {emp.employmentStatus === "active" ? "Deactivate" : "Activate"}
                  </button>
                  {staffAppAction(emp)}
                </div>
              </li>
            ))}
          </ul>

          {/* Desktop table */}
          <div className="mt-4 hidden overflow-x-auto rounded-2xl border border-brand-100 md:block">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead>
                <tr className="border-b border-brand-100 bg-brand-50/60 text-ink-700">
                  <th className="px-4 py-3 font-bold">Employee</th>
                  <th className="px-4 py-3 font-bold">Roles</th>
                  <th className="px-4 py-3 font-bold">Unit</th>
                  <th className="px-4 py-3 font-bold">Status</th>
                  <th className="px-4 py-3 font-bold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((emp) => (
                  <tr key={emp.id} className="border-b border-brand-50 align-top last:border-0">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-ink-900">{emp.fullName}</p>
                      <p className="text-xs text-ink-500">
                        {emp.employeeCode} · {emp.phone}
                      </p>
                    </td>
                    <td className="px-4 py-3">{roleChips(emp)}</td>
                    <td className="px-4 py-3 text-ink-700">{emp.branchName ?? "—"}</td>
                    <td className="px-4 py-3">{statusPill(emp)}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => openEdit(emp)}
                          className="min-h-[44px] rounded-full border border-brand-200 px-4 py-2 text-sm font-bold text-ink-700 hover:bg-brand-50"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void toggleStatus(emp)}
                          className="min-h-[44px] rounded-full border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-bold text-amber-900 hover:bg-amber-100 disabled:opacity-60"
                        >
                          {emp.employmentStatus === "active" ? "Deactivate" : "Activate"}
                        </button>
                        {staffAppAction(emp)}
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
