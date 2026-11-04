import { NextResponse } from "next/server";
import { getAdminGate } from "@/lib/admin";

/**
 * GET /api/admin/refunds?status=requested,approved — the refund queue
 * for the Finance screen (Phase 9). Defaults to the actionable
 * statuses (requested + approved); pass ?status=all for history.
 */
export async function GET(request: Request) {
  const gate = await getAdminGate();
  if (gate.kind === "misconfigured") {
    return NextResponse.json(
      { error: "NOT_CONFIGURED", message: "Server configuration error." },
      { status: 503 },
    );
  }
  if (gate.kind === "demo") {
    return NextResponse.json({ mode: "demo" }, { status: 503 });
  }
  if (gate.kind === "unauthenticated") {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  if (gate.kind === "forbidden") {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }
  const { supabase } = gate;

  const url = new URL(request.url);
  const statusParam = url.searchParams.get("status") ?? "requested,approved";
  const statuses = statusParam === "all"
    ? ["requested", "approved", "rejected", "processed"]
    : statusParam.split(",").map((s) => s.trim()).filter(Boolean);

  const { data, error } = await supabase
    .from("refunds")
    .select(
      "id, order_id, amount_paise, reason, method, status, requested_by_label, decided_by_label, decided_at, processed_at, created_at, orders ( total_paise, profiles ( name, phone ) )",
    )
    .in("status", statuses)
    .order("created_at", { ascending: true })
    .limit(200);
  if (error) {
    return NextResponse.json({ error: "Could not load refunds." }, { status: 500 });
  }

  const refunds = (data ?? []).map((r) => {
    const order = r.orders as unknown as {
      total_paise: number;
      profiles: { name: string | null; phone: string | null } | { name: string | null; phone: string | null }[] | null;
    } | null;
    const profile = order?.profiles
      ? Array.isArray(order.profiles)
        ? (order.profiles[0] ?? null)
        : order.profiles
      : null;
    return {
      id: r.id,
      orderId: r.order_id,
      amountPaise: r.amount_paise,
      reason: r.reason,
      method: r.method,
      status: r.status,
      requestedByLabel: r.requested_by_label,
      decidedByLabel: r.decided_by_label,
      decidedAt: r.decided_at,
      processedAt: r.processed_at,
      createdAt: r.created_at,
      orderTotalPaise: order?.total_paise ?? null,
      customer: profile?.name ?? "Customer",
      phone: profile?.phone ?? null,
    };
  });

  return NextResponse.json({ mode: "live", refunds });
}
