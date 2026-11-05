import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import {
  Badge,
  Card,
  EmptyBlock,
  ErrorBlock,
  LoadingBlock,
  Screen,
  Title,
  styles,
} from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { fetchAdminCustomers } from "../lib/api";
import { formatPaise } from "../lib/format";
import { roleLabel } from "../lib/roles";
import type { AdminCustomerRow } from "../lib/types";

/**
 * Customer Management list (Delta 1) — search + pagination over
 * GET /api/admin/customers (any admin tier). Lifetime spend is the
 * server-side finance figure (money actually collected). Tap a
 * customer for detail; disabling lives there (admin tier and up).
 */

const PAGE_SIZE = 20;

export default function AdminCustomersScreen() {
  const { isAdmin } = useAuth();
  const [rows, setRows] = useState<AdminCustomerRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await fetchAdminCustomers({
        q: search || undefined,
        page,
        pageSize: PAGE_SIZE,
      });
      setRows(data.customers);
      setTotal(data.total);
    } catch {
      setError("Could not load customers. Check the connection and try again.");
    }
  }, [search, page]);

  useFocusEffect(
    useCallback(() => {
      if (isAdmin) void load();
    }, [isAdmin, load]),
  );

  if (!isAdmin) {
    return (
      <Screen admin>
        <Title>Customers</Title>
        <Text style={styles.muted}>This section is for Z-clean admins only.</Text>
      </Screen>
    );
  }

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <Screen admin>
      <Title>Customers</Title>

      <View style={{ flexDirection: "row", gap: 8 }}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search name, email or phone…"
          style={[styles.input, { flex: 1 }]}
          returnKeyType="search"
          onSubmitEditing={() => {
            setPage(1);
            setSearch(query.trim());
          }}
        />
        <Pressable
          onPress={() => {
            setPage(1);
            setSearch(query.trim());
          }}
          style={({ pressed }) => [styles.searchButton, pressed && { opacity: 0.8 }]}
        >
          <Text style={styles.searchButtonText}>Search</Text>
        </Pressable>
      </View>

      {error ? (
        <ErrorBlock message={error} onRetry={() => void load()} />
      ) : rows === null ? (
        <LoadingBlock label="Loading customers…" />
      ) : rows.length === 0 ? (
        <EmptyBlock
          message={search ? `No customers match “${search}”.` : "No customer accounts yet."}
        />
      ) : (
        <>
          {rows.map((c) => (
            <Pressable
              key={c.id}
              onPress={() => router.push(`/admin-customer/${c.id}`)}
            >
              <Card>
                <View style={styles.rowBetween}>
                  <Text style={{ fontWeight: "700", fontSize: 15, flex: 1 }}>
                    {c.name ?? "Unnamed customer"}
                  </Text>
                  {c.disabled ? (
                    <Badge label="Disabled" tone="red" />
                  ) : (
                    <Badge label="Active" tone="green" />
                  )}
                </View>
                <Text style={styles.muted}>
                  {c.phone ?? "—"}
                  {c.email ? ` · ${c.email}` : ""}
                </Text>
                <View style={styles.rowBetween}>
                  <Text style={styles.muted}>
                    {roleLabel(c.role)} · {c.ordersCount} order
                    {c.ordersCount === 1 ? "" : "s"}
                  </Text>
                  <Text style={{ fontWeight: "700" }}>
                    {formatPaise(c.lifetimeSpendPaise)}
                  </Text>
                </View>
              </Card>
            </Pressable>
          ))}

          <View style={styles.rowBetween}>
            <Text style={styles.muted}>
              {total} customer{total === 1 ? "" : "s"} · page {page} of {pageCount}
            </Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Pressable
                disabled={page <= 1}
                onPress={() => setPage((p) => Math.max(1, p - 1))}
                style={[styles.pageButton, page <= 1 && { opacity: 0.4 }]}
              >
                <Text style={styles.pageButtonText}>← Prev</Text>
              </Pressable>
              <Pressable
                disabled={page >= pageCount}
                onPress={() => setPage((p) => Math.min(pageCount, p + 1))}
                style={[styles.pageButton, page >= pageCount && { opacity: 0.4 }]}
              >
                <Text style={styles.pageButtonText}>Next →</Text>
              </Pressable>
            </View>
          </View>
        </>
      )}
    </Screen>
  );
}
