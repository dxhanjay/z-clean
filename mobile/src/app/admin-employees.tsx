import { useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { Field, MultiChips, SelectChips, fieldErrorText } from "../components/forms";
import {
  Badge,
  Card,
  Chip,
  EmptyBlock,
  ErrorBlock,
  GhostButton,
  LoadingBlock,
  PrimaryButton,
  Screen,
  Title,
  styles,
} from "../components/ui";
import { useAuth } from "../context/AuthContext";
import {
  ApiError,
  createEmployee,
  fetchBranches,
  fetchEmployees,
  updateEmployee,
  type EmployeeBody,
} from "../lib/api";
import { STAFF_ROLES, staffRoleLabel } from "../lib/org";
import type { Branch, Employee } from "../lib/types";

/**
 * Employees (Mobile Phase 2) — the Phase 7a Employee Management
 * surface in the app: one list for every staff record, role/status
 * filters, and a create/edit form over the 12-role permission matrix
 * (src/lib/org.ts). Employees are operational records; a linked
 * login is optional and never grants staff access by itself.
 */
export default function AdminEmployeesScreen() {
  const { isAdmin } = useAuth();
  const [employees, setEmployees] = useState<Employee[] | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [roleFilter, setRoleFilter] = useState("ALL");
  const [editing, setEditing] = useState<Employee | "new" | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [emps, brs] = await Promise.all([
        fetchEmployees(),
        fetchBranches().catch(() => [] as Branch[]),
      ]);
      setEmployees(emps);
      setBranches(brs);
    } catch {
      setError("Could not load employees. Check the connection and try again.");
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (isAdmin) void load();
    }, [isAdmin, load]),
  );

  const visible = useMemo(() => {
    if (!employees) return [];
    return employees.filter((e) => {
      if (statusFilter !== "ALL" && e.employmentStatus !== statusFilter) return false;
      if (roleFilter !== "ALL" && !e.roles.includes(roleFilter)) return false;
      return true;
    });
  }, [employees, statusFilter, roleFilter]);

  if (!isAdmin) {
    return (
      <Screen>
        <Title>Employees</Title>
        <Text style={styles.muted}>This section is for Z-clean admins only.</Text>
      </Screen>
    );
  }

  return (
    <Screen>
      <Title>Employees</Title>
      <PrimaryButton
        label={editing === "new" ? "Close the form" : "＋ Add employee"}
        onPress={() => setEditing(editing === "new" ? null : "new")}
      />
      {editing ? (
        <EmployeeForm
          key={editing === "new" ? "new" : editing.id}
          employee={editing === "new" ? null : editing}
          employees={employees ?? []}
          branches={branches}
          onDone={() => {
            setEditing(null);
            void load();
          }}
          onCancel={() => setEditing(null)}
        />
      ) : null}

      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={{ flexDirection: "row", gap: 8, paddingVertical: 2 }}>
          <Chip label="All staff" selected={statusFilter === "ALL"} onPress={() => setStatusFilter("ALL")} />
          <Chip label="Active" selected={statusFilter === "active"} onPress={() => setStatusFilter("active")} />
          <Chip label="Inactive" selected={statusFilter === "inactive"} onPress={() => setStatusFilter("inactive")} />
        </View>
      </ScrollView>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={{ flexDirection: "row", gap: 8, paddingVertical: 2 }}>
          <Chip label="All roles" selected={roleFilter === "ALL"} onPress={() => setRoleFilter("ALL")} />
          {STAFF_ROLES.map((r) => (
            <Chip
              key={r.role}
              label={r.label}
              selected={roleFilter === r.role}
              onPress={() => setRoleFilter(r.role)}
            />
          ))}
        </View>
      </ScrollView>

      {error ? (
        <ErrorBlock message={error} onRetry={() => void load()} />
      ) : !employees ? (
        <LoadingBlock label="Loading employees…" />
      ) : visible.length === 0 ? (
        <EmptyBlock message="No employees match these filters." />
      ) : (
        visible.map((e) => (
          <Card key={e.id}>
            <View style={styles.rowBetween}>
              <Text style={{ fontWeight: "800", fontSize: 15 }}>{e.fullName}</Text>
              <Badge
                label={e.employmentStatus}
                tone={e.employmentStatus === "active" ? "green" : "red"}
              />
            </View>
            <Text style={styles.muted}>
              {e.employeeCode} · {e.phone}
              {e.email ? ` · ${e.email}` : ""}
            </Text>
            <View style={styles.rowWrap}>
              {e.roles.map((r) => (
                <Badge key={r} label={staffRoleLabel(r)} tone="grey" />
              ))}
            </View>
            <Text style={styles.muted}>
              {e.branchName ? `Branch: ${e.branchName} · ` : ""}
              {e.managerName ? `Manager: ${e.managerName} · ` : ""}
              {e.joiningDate ? `Joined ${e.joiningDate}` : "Joining date not set"}
            </Text>
            <View style={styles.rowWrap}>
              <GhostButton label="Edit" onPress={() => setEditing(e)} />
              <GhostButton
                label={e.employmentStatus === "active" ? "Deactivate" : "Reactivate"}
                onPress={() => {
                  void (async () => {
                    try {
                      await updateEmployee(e.id, {
                        employmentStatus: e.employmentStatus === "active" ? "inactive" : "active",
                      });
                      void load();
                    } catch {
                      setError("Could not change the employment status. Try again.");
                    }
                  })();
                }}
              />
            </View>
          </Card>
        ))
      )}
    </Screen>
  );
}

function EmployeeForm({
  employee,
  employees,
  branches,
  onDone,
  onCancel,
}: {
  employee: Employee | null;
  employees: Employee[];
  branches: Branch[];
  onDone: () => void;
  onCancel: () => void;
}) {
  const [fullName, setFullName] = useState(employee?.fullName ?? "");
  const [phone, setPhone] = useState(employee?.phone ?? "");
  const [email, setEmail] = useState(employee?.email ?? "");
  const [employeeCode, setEmployeeCode] = useState(employee?.employeeCode ?? "");
  const [roles, setRoles] = useState<string[]>(employee?.roles ?? []);
  const [branchId, setBranchId] = useState<string | null>(employee?.branchId ?? null);
  const [managerId, setManagerId] = useState<string | null>(employee?.managerId ?? null);
  const [joiningDate, setJoiningDate] = useState(employee?.joiningDate ?? "");
  const [employmentStatus, setEmploymentStatus] = useState<"active" | "inactive">(
    employee?.employmentStatus ?? "active",
  );
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string> | undefined>(undefined);

  const toggleRole = (role: string) =>
    setRoles((prev) => (prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]));

  async function submit() {
    setBusy(true);
    setFormError(null);
    setFieldErrors(undefined);
    const body: EmployeeBody = {
      fullName: fullName.trim(),
      phone: phone.trim(),
      email: email.trim(),
      employeeCode: employeeCode.trim(),
      roles,
      branchId,
      managerId,
      joiningDate: joiningDate.trim(),
      employmentStatus,
    };
    try {
      if (employee) await updateEmployee(employee.id, body);
      else await createEmployee(body);
      onDone();
    } catch (e) {
      if (e instanceof ApiError) {
        setFormError(e.message);
        setFieldErrors(e.fieldErrors);
      } else {
        setFormError("Could not save the employee. Try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  const managerOptions = employees
    .filter((e) => e.id !== employee?.id)
    .map((e) => ({ value: e.id, label: `${e.fullName} (${e.employeeCode})` }));

  return (
    <Card>
      <Text style={styles.label}>{employee ? `Edit ${employee.fullName}` : "New employee"}</Text>
      <Field label="Full name" value={fullName} onChangeText={setFullName} placeholder="e.g. Ravi Kumar" error={fieldErrorText(fieldErrors, "fullName")} />
      <Field label="Mobile number" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="10-digit Indian mobile" error={fieldErrorText(fieldErrors, "phone")} />
      <Field label="Email (optional)" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" placeholder="name@example.com" error={fieldErrorText(fieldErrors, "email")} />
      <Field
        label="Employee code (optional)"
        value={employeeCode}
        onChangeText={setEmployeeCode}
        autoCapitalize="characters"
        placeholder="Leave blank to auto-generate (ZC-EMP-…)"
        error={fieldErrorText(fieldErrors, "employeeCode")}
      />
      <View style={{ gap: 2 }}>
        <MultiChips
          label="Roles (at least one)"
          options={STAFF_ROLES.map((r) => ({ value: r.role, label: r.label }))}
          values={roles}
          onToggle={toggleRole}
        />
        {fieldErrorText(fieldErrors, "roles") ? (
          <Text style={[styles.errorText, { textAlign: "left", fontSize: 12 }]}>{fieldErrorText(fieldErrors, "roles")}</Text>
        ) : null}
      </View>
      <SelectChips
        label="Branch / plant"
        options={branches.map((b) => ({ value: b.id, label: b.name }))}
        value={branchId}
        onChange={setBranchId}
        includeNoneLabel="No branch"
      />
      <SelectChips
        label="Reports to (manager)"
        options={managerOptions}
        value={managerId}
        onChange={setManagerId}
        includeNoneLabel="No manager"
      />
      <Field label="Joining date (YYYY-MM-DD, optional)" value={joiningDate} onChangeText={setJoiningDate} placeholder="2026-11-01" error={fieldErrorText(fieldErrors, "joiningDate")} />
      <SelectChips
        label="Employment status"
        options={[
          { value: "active" as const, label: "Active" },
          { value: "inactive" as const, label: "Inactive" },
        ]}
        value={employmentStatus}
        onChange={(v) => v && setEmploymentStatus(v)}
      />
      {formError ? <Text style={styles.errorText}>{formError}</Text> : null}
      <PrimaryButton label={employee ? "Save changes" : "Add employee"} busy={busy} onPress={() => void submit()} />
      <GhostButton label="Cancel" onPress={onCancel} />
    </Card>
  );
}
