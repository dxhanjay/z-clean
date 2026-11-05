import { NextResponse } from "next/server";
import { getAdminGate } from "@/lib/admin";

/**
 * GET /api/admin/reviews — the moderation list (Delta 3), any admin
 * tier. Reviews are REAL customer submissions (schema_v9.sql): this
 * endpoint only reads them; publishing happens through the PATCH on
 * /api/admin/reviews/[id].
 *
 * Query: ?filter=pending (approved = false, the default view for the
 * queue) | approved | all. Rows are newest-first, capped at 200, and
 * carry the reviewer's name for moderation context — internal only;
 * the PUBLIC surface shows first name + area (lib/reviews.ts).
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

function firstOf<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export async function GET(request: Request) {
  const gate = await getAdminGate();
  const err = gateError(gate);
  if (err) return err;
  if (gate.kind !== "ok") {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }
  const { supabase } = gate;

  const filter = new URL(request.url).searchParams.get("filter") ?? "pending";

  // profiles carries name/phone only (no email column in this schema);
  // name + the order's area is the context moderation needs.
  let query = supabase
    .from("reviews")
    .select(
      "id, order_id, rating, text, approved, created_at, profiles ( name ), orders ( addresses ( area, city ) )",
    )
    .order("created_at", { ascending: false })
    .limit(200);
  if (filter === "pending") query = query.eq("approved", false);
  if (filter === "approved") query = query.eq("approved", true);

  const { data, error } = await query;
  if (error) {
    console.error("[admin/reviews] list failed:", error.message);
    return NextResponse.json(
      { error: "Could not load reviews. Please try again." },
      { status: 500 },
    );
  }

  type Row = {
    id: string;
    order_id: string;
    rating: number;
    text: string;
    approved: boolean;
    created_at: string;
    profiles: { name: string | null } | { name: string | null }[] | null;
    orders: {
      addresses:
        | { area: string | null; city: string }
        | { area: string | null; city: string }[]
        | null;
    } | null;
  };

  const reviews = ((data ?? []) as unknown as Row[]).map((r) => {
    const profile = firstOf(r.profiles);
    const address = firstOf(r.orders?.addresses ?? null);
    return {
      id: r.id,
      orderId: r.order_id,
      orderRef: r.order_id.slice(0, 8).toUpperCase(),
      rating: r.rating,
      text: r.text,
      approved: r.approved,
      createdAt: r.created_at,
      reviewerName: profile?.name ?? null,
      area: address?.area ?? null,
      city: address?.city ?? null,
    };
  });

  return NextResponse.json({ mode: "live", filter, reviews });
}
