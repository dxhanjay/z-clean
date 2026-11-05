import { NextResponse } from "next/server";
import { getAdminGate } from "@/lib/admin";
import { bucketDailySeries, statusBreakdown } from "@/lib/analytics";
import { istDayRangeUtc, istToday } from "@/lib/finance";

/**
 * GET /api/admin/analytics?days=14 — dashboard chart data (Delta 1),
 * any admin tier. The series is orders placed per Asia/Kolkata day
 * plus revenue collected per day, where revenue is the staff
 * ledger's 'payment' entries (payment_entries) — real money in,
 * bucketed by src/lib/analytics.ts so the web charts and any other
 * consumer can never disagree. statusCounts is a snapshot of every
 * order's current status. days clamps to 1–90 (default 14).
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
  const { supabase } = gate;

  const url = new URL(request.url);
  const daysParam = Number(url.searchParams.get("days") ?? "14");
  const days = Number.isFinite(daysParam)
    ? Math.min(90, Math.max(1, Math.floor(daysParam)))
    : 14;

  const now = new Date();
  const todayIst = istToday(now);
  const [y, m, d] = todayIst.split("-").map(Number);
  const startDate = new Date(Date.UTC(y, m - 1, d) - (days - 1) * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const windowStartUtc = istDayRangeUtc(startDate).startUtc;

  const [{ data: orderRows, error }, { data: entryRows }, { data: statusRows }] =
    await Promise.all([
      supabase
        .from("orders")
        .select("created_at")
        .gte("created_at", windowStartUtc)
        .order("created_at", { ascending: true })
        .limit(10000),
      supabase
        .from("payment_entries")
        .select("created_at, amount_paise")
        .eq("entry_type", "payment")
        .gte("created_at", windowStartUtc)
        .limit(20000),
      supabase.from("orders").select("status").limit(20000),
    ]);
  if (error) {
    return NextResponse.json({ error: "Could not load analytics." }, { status: 500 });
  }

  const series = bucketDailySeries(
    {
      orders: (orderRows ?? []).map((o) => ({ createdAt: o.created_at as string })),
      revenue: (entryRows ?? []).map((e) => ({
        createdAt: e.created_at as string,
        amountPaise: e.amount_paise as number,
      })),
    },
    days,
    now,
  );

  return NextResponse.json({
    mode: "live",
    days,
    series,
    statusCounts: statusBreakdown(
      (statusRows ?? []).map((o) => ({ status: o.status as string })),
    ),
  });
}
