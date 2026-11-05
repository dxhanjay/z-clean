import { NextResponse } from "next/server";
import { getAdminGate } from "@/lib/admin";
import {
  buildNotifications,
  notificationCounts,
  type NotificationOrder,
} from "@/lib/notifications";
import { istDayRangeUtc, istToday } from "@/lib/finance";

/**
 * GET /api/admin/notifications — the admin notifications view
 * (Delta 1), any admin tier. NOTHING is stored: every item is
 * derived on read from bounded aggregates (src/lib/notifications.ts
 * holds the rules and thresholds) fetched through the caller's
 * admin RLS client, so resolving the underlying thing makes its
 * notification disappear. Response: { items, counts: { total,
 * high, medium, low } } — the shell's bell badge shows `high`.
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

function firstName(
  profiles:
    | { name: string | null }
    | { name: string | null }[]
    | null
    | undefined,
): string | null {
  if (!profiles) return null;
  const row = Array.isArray(profiles) ? profiles[0] : profiles;
  return row?.name ?? null;
}

export async function GET() {
  const gate = await getAdminGate();
  const err = gateError(gate);
  if (err) return err;
  if (gate.kind !== "ok") {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }
  const { supabase } = gate;
  const now = new Date();

  const yesterdayDate = istToday(new Date(now.getTime() - 86_400_000));
  const yesterdayRange = istDayRangeUtc(yesterdayDate);
  const todayIst = istToday(now);
  const voucherWindowEnd = new Date(
    new Date(`${todayIst}T00:00:00.000Z`).getTime() + 8 * 86_400_000,
  )
    .toISOString()
    .slice(0, 10);
  const failedSince = new Date(now.getTime() - 30 * 86_400_000).toISOString();

  const [
    { data: refundRows },
    { data: openOrderRows },
    { data: failedRows },
    { data: pickupRows },
    { data: voucherRows },
    { count: cashActivity },
    { data: closingRow },
  ] = await Promise.all([
    supabase
      .from("refunds")
      .select(
        "id, order_id, amount_paise, status, created_at, decided_at, orders ( profiles ( name ) )",
      )
      .in("status", ["requested", "approved"])
      .order("created_at", { ascending: true })
      .limit(200),
    supabase
      .from("orders")
      .select("id, status, payment_status, created_at, profiles ( name )")
      .in("status", [
        "PLACED",
        "PICKUP_SCHEDULED",
        "PICKED_UP",
        "RECEIVED",
        "IN_PROCESS",
        "READY",
      ])
      .order("created_at", { ascending: true })
      .limit(500),
    supabase
      .from("orders")
      .select("id, status, payment_status, created_at, profiles ( name )")
      .eq("payment_status", "failed")
      .gte("created_at", failedSince)
      .limit(100),
    supabase
      .from("pickup_requests")
      .select("id, name, phone, created_at")
      .is("user_id", null)
      .eq("status", "PICKUP_SCHEDULED")
      .order("created_at", { ascending: true })
      .limit(200),
    supabase
      .from("gift_vouchers")
      .select("id, code, kind, status, balance_paise, valid_until")
      .in("status", ["created", "issued", "partially_redeemed"])
      .not("valid_until", "is", null)
      .gte("valid_until", todayIst)
      .lte("valid_until", voucherWindowEnd)
      .limit(200),
    supabase
      .from("payment_entries")
      .select("id", { count: "exact", head: true })
      .eq("method", "cash")
      .gte("created_at", yesterdayRange.startUtc)
      .lt("created_at", yesterdayRange.endUtc),
    supabase
      .from("cash_closings")
      .select("id")
      .eq("closing_date", yesterdayDate)
      .maybeSingle(),
  ]);

  type OrderJoin = {
    profiles: { name: string | null } | { name: string | null }[] | null;
  };
  type OrderDbRow = {
    id: string;
    status: string;
    payment_status: string;
    created_at: string;
  } & OrderJoin;
  const ordersById = new Map<string, NotificationOrder>();
  for (const row of (openOrderRows ?? []) as unknown as OrderDbRow[]) {
    ordersById.set(row.id, {
      id: row.id,
      status: row.status,
      paymentStatus: row.payment_status,
      createdAt: row.created_at,
      customerLabel: firstName(row.profiles),
    });
  }
  for (const row of (failedRows ?? []) as unknown as OrderDbRow[]) {
    if (!ordersById.has(row.id)) {
      ordersById.set(row.id, {
        id: row.id,
        status: row.status,
        paymentStatus: row.payment_status,
        createdAt: row.created_at,
        customerLabel: firstName(row.profiles),
      });
    }
  }

  const items = buildNotifications(
    {
      refunds: ((refundRows ?? []) as unknown as {
        id: string;
        order_id: string;
        amount_paise: number;
        status: string;
        created_at: string;
        decided_at: string | null;
        orders: { profiles: { name: string | null } | { name: string | null }[] | null } | null;
      }[]).map((r) => ({
        id: r.id,
        orderId: r.order_id,
        amountPaise: r.amount_paise,
        status: r.status,
        createdAt: r.created_at,
        decidedAt: r.decided_at,
        customerLabel: firstName(r.orders?.profiles),
      })),
      orders: [...ordersById.values()],
      guestPickups: (pickupRows ?? []).map((p) => ({
        id: p.id as string,
        name: p.name as string,
        phone: p.phone as string,
        createdAt: p.created_at as string,
      })),
      vouchers: (voucherRows ?? []).map((v) => ({
        id: v.id as string,
        code: v.code as string,
        kind: v.kind as string,
        status: v.status as string,
        validUntil: v.valid_until as string | null,
        balancePaise: v.balance_paise as number | null,
      })),
      yesterday: {
        date: yesterdayDate,
        hasCashActivity: (cashActivity ?? 0) > 0,
        hasClosing: Boolean(closingRow),
      },
      now,
    },
    now,
  );

  return NextResponse.json({
    mode: "live",
    items,
    counts: notificationCounts(items),
  });
}
