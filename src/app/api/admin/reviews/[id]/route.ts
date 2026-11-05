import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAdminGate, roleGateError } from "@/lib/admin";
import { logAudit } from "@/lib/audit";
import { reviewModerationSchema } from "@/lib/validation";

/**
 * Review moderation mutations (Delta 3) — ADMIN tier and up
 * (ops_manager may VIEW the queue via the list route but not publish:
 * what reaches the public site is a trust decision).
 *
 * PATCH  /api/admin/reviews/[id] { approved } — approve publishes the
 *        review to the storefront (audit review.approve); setting
 *        approved=false un-publishes it (audit review.reject — the
 *        row is KEPT so the decision is reversible and auditable).
 * DELETE /api/admin/reviews/[id] — removes the review entirely
 *        (audit review.delete); reserved for abuse/spam.
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

async function loadReview(supabase: SupabaseClient, id: string) {
  const { data } = await supabase
    .from("reviews")
    .select("id, order_id, rating, approved")
    .eq("id", id)
    .maybeSingle();
  return data as { id: string; order_id: string; rating: number; approved: boolean } | null;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await getAdminGate();
  const err = gateError(gate);
  if (err) return err;
  if (gate.kind !== "ok") {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }
  const roleErr = roleGateError(gate, "admin");
  if (roleErr) return roleErr;
  const { supabase, user } = gate;
  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const parsed = reviewModerationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Please fix the highlighted fields." },
      { status: 422 },
    );
  }

  const existing = await loadReview(supabase, id);
  if (!existing) {
    return NextResponse.json({ error: "Review not found." }, { status: 404 });
  }

  const { error } = await supabase
    .from("reviews")
    .update({ approved: parsed.data.approved })
    .eq("id", id);
  if (error) {
    console.error("[admin/reviews] update failed:", error.message);
    return NextResponse.json(
      { error: "The review could not be updated. Please try again." },
      { status: 500 },
    );
  }

  await logAudit(supabase, {
    actorUserId: user.id,
    actorLabel: user.email ?? null,
    action: parsed.data.approved ? "review.approve" : "review.reject",
    entity: "reviews",
    entityId: id,
    details: {
      orderId: existing.order_id,
      rating: existing.rating,
      from: existing.approved,
      to: parsed.data.approved,
    },
  });

  return NextResponse.json({
    mode: "live",
    review: { id, approved: parsed.data.approved },
  });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await getAdminGate();
  const err = gateError(gate);
  if (err) return err;
  if (gate.kind !== "ok") {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }
  const roleErr = roleGateError(gate, "admin");
  if (roleErr) return roleErr;
  const { supabase, user } = gate;
  const { id } = await params;

  const existing = await loadReview(supabase, id);
  if (!existing) {
    return NextResponse.json({ error: "Review not found." }, { status: 404 });
  }

  const { error } = await supabase.from("reviews").delete().eq("id", id);
  if (error) {
    console.error("[admin/reviews] delete failed:", error.message);
    return NextResponse.json(
      { error: "The review could not be deleted. Please try again." },
      { status: 500 },
    );
  }

  await logAudit(supabase, {
    actorUserId: user.id,
    actorLabel: user.email ?? null,
    action: "review.delete",
    entity: "reviews",
    entityId: id,
    details: { orderId: existing.order_id, rating: existing.rating },
  });

  return NextResponse.json({ mode: "live", deleted: true });
}
