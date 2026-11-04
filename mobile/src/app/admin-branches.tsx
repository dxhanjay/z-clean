import { useFocusEffect } from "expo-router";
import { memo, useCallback, useState } from "react";
import { FlatList, RefreshControl, Text, View } from "react-native";
import { Field, SelectChips, ToggleRow, fieldErrorText } from "../components/forms";
import {
  Badge,
  Card,
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
  createBranch,
  fetchBranches,
  fetchEmployees,
  updateBranch,
  type BranchBody,
} from "../lib/api";
import { brand } from "../lib/config";
import { BRANCH_TYPES, branchTypeLabel } from "../lib/org";
import type { Branch, Employee } from "../lib/types";

/**
 * Branches (Mobile Phase 2) — plants, collection centers and
 * branches (Phase 7a) in the app: list, create and edit, with the
 * manager link and the active toggle. Mirrors the web admin's fields
 * exactly (name, type, address, area, pincode, manager, active).
 */
const BranchRow = memo(function BranchRow({
  branch: b,
  onEdit,
  onToggleActive,
}: {
  branch: Branch;
  onEdit: (branch: Branch) => void;
  onToggleActive: (branch: Branch) => void;
}) {
  return (
    <Card>
      <View style={styles.rowBetween}>
        <Text style={{ fontWeight: "800", fontSize: 15, flex: 1 }}>{b.name}</Text>
        <Badge label={b.active ? "Active" : "Inactive"} tone={b.active ? "green" : "red"} />
      </View>
      <Text style={styles.muted}>
        {branchTypeLabel(b.type)}
        {b.area ? ` · ${b.area}` : ""}
        {b.pincode ? ` · ${b.pincode}` : ""}
      </Text>
      {b.address ? <Text style={styles.muted}>{b.address}</Text> : null}
      <Text style={styles.muted}>Manager: {b.managerName ?? "—"}</Text>
      <View style={styles.rowWrap}>
        <GhostButton label="Edit" onPress={() => onEdit(b)} />
        <GhostButton label={b.active ? "Deactivate" : "Reactivate"} onPress={() => onToggleActive(b)} />
      </View>
    </Card>
  );
});

export default function AdminBranchesScreen() {
  const { isAdmin } = useAuth();
  const [branches, setBranches] = useState<Branch[] | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Branch | "new" | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [brs, emps] = await Promise.all([
        fetchBranches(),
        fetchEmployees().catch(() => [] as Employee[]),
      ]);
      setBranches(brs);
      setEmployees(emps);
    } catch {
      setError("Could not load branches. Check the connection and try again.");
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

  const toggleActive = useCallback(
    (b: Branch) => {
      void (async () => {
        try {
          await updateBranch(b.id, { active: !b.active });
          void load();
        } catch {
          setError("Could not change the branch status. Try again.");
        }
      })();
    },
    [load],
  );

  if (!isAdmin) {
    return (
      <Screen>
        <Title>Branches & plants</Title>
        <Text style={styles.muted}>This section is for Z-clean admins only.</Text>
      </Screen>
    );
  }

  const header = (
    <>
      <Title>Branches & plants</Title>
      <PrimaryButton
        label={editing === "new" ? "Close the form" : "＋ Add branch / plant / center"}
        onPress={() => setEditing(editing === "new" ? null : "new")}
      />
      {editing ? (
        <BranchForm
          key={editing === "new" ? "new" : editing.id}
          branch={editing === "new" ? null : editing}
          employees={employees}
          onDone={() => {
            setEditing(null);
            void load();
          }}
          onCancel={() => setEditing(null)}
        />
      ) : null}
    </>
  );

  if (!branches && !error) {
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
        data={branches ?? []}
        keyExtractor={(b) => b.id}
        renderItem={({ item }) => (
          <BranchRow branch={item} onEdit={setEditing} onToggleActive={toggleActive} />
        )}
        ListHeaderComponent={header}
        ListEmptyComponent={
          error ? (
            <ErrorBlock message={error} onRetry={() => void load()} />
          ) : (
            <EmptyBlock message="No branches yet. Add the plant and collection centers above." />
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

function BranchForm({
  branch,
  employees,
  onDone,
  onCancel,
}: {
  branch: Branch | null;
  employees: Employee[];
  onDone: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(branch?.name ?? "");
  const [type, setType] = useState<string>(branch?.type ?? "collection_center");
  const [address, setAddress] = useState(branch?.address ?? "");
  const [area, setArea] = useState(branch?.area ?? "");
  const [pincode, setPincode] = useState(branch?.pincode ?? "");
  const [managerEmployeeId, setManagerEmployeeId] = useState<string | null>(
    branch?.managerEmployeeId ?? null,
  );
  const [active, setActive] = useState(branch?.active ?? true);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string> | undefined>(undefined);

  async function submit() {
    setBusy(true);
    setFormError(null);
    setFieldErrors(undefined);
    const body: BranchBody = {
      name: name.trim(),
      type,
      address: address.trim(),
      area: area.trim(),
      pincode: pincode.trim(),
      managerEmployeeId,
      active,
    };
    try {
      if (branch) await updateBranch(branch.id, body);
      else await createBranch(body);
      onDone();
    } catch (e) {
      if (e instanceof ApiError) {
        setFormError(e.message);
        setFieldErrors(e.fieldErrors);
      } else {
        setFormError("Could not save the branch. Try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <Text style={styles.label}>{branch ? `Edit ${branch.name}` : "New branch / plant / center"}</Text>
      <Field label="Name" value={name} onChangeText={setName} placeholder="e.g. Sector 4 Collection Center" error={fieldErrorText(fieldErrors, "name")} />
      <SelectChips
        label="Type"
        options={BRANCH_TYPES.map((t) => ({ value: t.value as string, label: t.label }))}
        value={type}
        onChange={(v) => v && setType(v)}
      />
      <Field label="Address (optional)" value={address} onChangeText={setAddress} placeholder="Street address" />
      <Field label="Area (optional)" value={area} onChangeText={setArea} placeholder="e.g. Sector 4 / City Centre" />
      <Field label="Pincode (optional)" value={pincode} onChangeText={setPincode} keyboardType="number-pad" placeholder="827004" error={fieldErrorText(fieldErrors, "pincode")} />
      <SelectChips
        label="Manager"
        options={employees.map((e) => ({ value: e.id, label: `${e.fullName} (${e.employeeCode})` }))}
        value={managerEmployeeId}
        onChange={setManagerEmployeeId}
        includeNoneLabel="No manager"
      />
      <ToggleRow label="Active (serves orders)" value={active} onValueChange={setActive} />
      {formError ? <Text style={styles.errorText}>{formError}</Text> : null}
      <PrimaryButton label={branch ? "Save changes" : "Add branch"} busy={busy} onPress={() => void submit()} />
      <GhostButton label="Cancel" onPress={onCancel} />
    </Card>
  );
}
