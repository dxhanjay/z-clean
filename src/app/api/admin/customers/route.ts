import { NextResponse } from "next/server";
import { getAdminGate } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  summarizeCustomerOrders,
  type CustomerOrderRow,
} from "@/lib/customers-server";

/**
 * GET /api/admin/customers?q=&page=&pageSize= — Customer Management
 * list (Delta 1), any admin tier.
 *
 * Why the service-role client: the row needs the account EMAIL,
 * which lives in Supabase Auth, not in profiles — and the aggregates
 * span every customer's orders/payments/ledger rows. The caller is
 * still fully gated by getAdminGate first; the service client is
 * only the data reader (the same posture as the guest-pickup insert).
 * Everything is bounded: at most 5,000 profiles / auth accounts are
 * scanned, search + pagination happen over that set in memory, and
 * money aggregates are computed only for the page being returned.
 * Lifetime spend is the finance engine's effective paid — see
 * src/lib/customers-server.ts.
 */

type Gate = Awaited<ReturnType<typeof getAdminGate>>;

function gateError(gate: Gate) {
  if (gate.kind === "misconfigured") {
    return NextResponse.json(
      { error: "NOT_CONFIGURED", message: "Server configuration error." },
      { status: 503 },
    );
  }
  if (gate.kind === "demo") {
    return NextResponse.json(
      { mode: "demo", message: "Supabase not configured — demo mode." },
      { status: 503 },
    );
  }
  if (gate.kind === "unauthenticated") {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  if (gate.kind === "forbidden") {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }
  return null;
}

export async function GET(request: Request) {
  const gate = await getAdminGate();
  const err = gateError(gate);
  if (err) return err;
  if (gate.kind !== "ok") {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json(
      { error: "NOT_CONFIGURED", message: "Server configuration error." },
      { status: 503 },
    );
  }

  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim().toLowerCase();
  const page = Math.max(1, Math.floor(Number(url.searchParams.get("page") ?? "1")) || 1);
  const pageSize = Math.min(
    50,
    Math.max(1, Math.floor(Number(url.searchParams.get("pageSize") ?? "20")) || 20),
  );

  const [{ data: profileRows, error }, emailMap] = await Promise.all([
    admin
      .from("profiles")
      .select("id, name, phone, role, disabled, created_at")
      .order("created_at", { ascending: false })
      .limit(5000),
    (async () => {
      const map = new Map<string, string>();
      for (let pageNo = 1; pageNo <= 5; pageNo++) {
        const { data, error: listError } = await admin.auth.admin.listUsers({
          page: pageNo,
          perPage: 1000,
        });
        if (listError || !data) break;
        for (const u of data.users) if (u.email) map.set(u.id, u.email);
        if (data.users.length < 1000) break;
      }
      return map;
    })(),
  ]);
  if (error || !profileRows) {
    return NextResponse.json({ error: "Could not load customers." }, { status: 500 });
  }

  let customers = profileRows.map((p) => ({
    id: p.id as string,
    name: (p.name as string | null) ?? null,
    email: emailMap.get(p.id as string) ?? null,
    phone: (p.phone as string | null) ?? null,
    role: p.role as string,
    disabled: Boolean(p.disabled),
    createdAt: p.created_at as string,
  }));
  if (q) {
    customers = customers.filter(
      (c) =>
        (c.name ?? "").toLowerCase().includes(q) ||
        (c.email ?? "").toLowerCase().includes(q) ||
        (c.phone ?? "").toLowerCase().includes(q),
    );
  }

  const total = customers.length;
  const pageRows = customers.slice((page - 1) * pageSize, page * pageSize);
  const pageIds = pageRows.map((c) => c.id);

  /* Money aggregates for THIS page only. */
  const summaries = new Map(
    pageRows.map((c) => [
      c.id,
      { ordersCount: 0, lifetimeSpendPaise: 0, outstandingPaise: 0, lastOrderAt: null as string | null },
    ]),
  );
  if (pageIds.length > 0) {
    const { data: orderRows } = await admin
      .from("orders")
      .select("id, user_id, status, payment_status, total_paise, created_at")
      .in("user_id", pageIds)
      .limit(10000);
    const orders = (orderRows ?? []) as CustomerOrderRow[];
    const orderIds = orders.map((o) => o.id);
    const [{ data: payRows }, { data: entryRows }] =
      orderIds.length > 0
        ? await Promise.all([
            admin
              .from("payments")
              .select("order_id, amount_paise, status")
              .in("order_id", orderIds)
              .limit(20000),
            admin
              .from("payment_entries")
              .select("order_id, entry_type, method, amount_paise")
              .in("order_id", orderIds)
              .limit(20000),
          ])
        : [{ data: [] }, { data: [] }];
    const payments = (payRows ?? []) as {
      order_id: string;
      amount_paise: number;
      status: string;
    }[];
    const entries = (entryRows ?? []) as {
      order_id: string;
      entry_type: "payment" | "refund";
      method: string;
      amount_paise: number;
    }[];
    for (const customer of pageRows) {
      summaries.set(
        customer.id,
        summarizeCustomerOrders(
          orders.filter((o) => o.user_id === customer.id),
          payments,
          entries,
        ),
      );
    }
  }

  return NextResponse.json({
    mode: "live",
    customers: pageRows.map((c) => ({ ...c, ...summaries.get(c.id) })),
    page,
    pageSize,
    total,
  });
}
