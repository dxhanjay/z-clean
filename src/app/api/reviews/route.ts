import { NextResponse } from "next/server";
import { resolveRequestAuth } from "@/lib/supabase/request-auth";
import { demoOrNotConfigured, notConfiguredResponse } from "@/lib/api-errors";
import { reviewCreateSchema } from "@/lib/validation";
import { reviewEligibility } from "@/lib/reviews";

/**
 * POST /api/reviews — a customer reviews their own DELIVERED order
 * (Delta 3).
 *
 * The integrity rules are enforced twice: here, and again by the
 * database (RLS insert policy + unique(order_id) + CHECKs in
 * supabase/schema_v9.sql). A review is born UNAPPROVED — it reaches
 * the public site only after staff approval in /admin/reviews.
 *
 * Signed-in only, cookie (web) or Bearer (mobile) — resolveRequestAuth
 * handles both, and every query runs under the caller's RLS, so an
 * order belonging to someone else is indistinguishable from a missing
 * one (404).
 *
 * Answers:
 *   201 { review }                       created, approved: false
 *   409 { code: "ALREADY_REVIEWED" }     one review per order
 *   422 { code: "ORDER_NOT_DELIVERED" }  reviews open after delivery
 *   422                                  invalid body (zod)
 *   401                                  not signed in
 *   503 { mode: "demo" }                 no live data layer
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const parsed = reviewCreateSchema.safeParse(body);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join(".");
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return NextResponse.json(
      { error: "Please fix the highlighted fields.", fieldErrors },
      { status: 422 },
    );
  }
  const { orderId, rating, text } = parsed.data;

  const auth = await resolveRequestAuth();
  if (auth.kind === "misconfigured") return notConfiguredResponse();
  if (auth.kind === "unconfigured") {
    return demoOrNotConfigured({ mode: "demo" });
  }
  if (auth.kind !== "user") {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  const { supabase, user } = auth;

  // The order, under the caller's RLS: foreign orders read as missing.
  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("id, status")
    .eq("id", orderId)
    .maybeSingle();
  if (orderError) {
    console.error("[reviews] order lookup failed:", orderError.message);
    return NextResponse.json(
      { error: "Could not check that order. Please try again." },
      { status: 500 },
    );
  }
  if (!order) {
    return NextResponse.json({ error: "Order not found." }, { status: 404 });
  }

  const { data: existing } = await supabase
    .from("reviews")
    .select("id")
    .eq("order_id", orderId)
    .maybeSingle();

  const verdict = reviewEligibility(order, Boolean(existing));
  if (!verdict.eligible) {
    return NextResponse.json(
      { error: verdict.message, code: verdict.code },
      { status: verdict.code === "ALREADY_REVIEWED" ? 409 : 422 },
    );
  }

  const { data: review, error: insertError } = await supabase
    .from("reviews")
    .insert({ order_id: orderId, user_id: user.id, rating, text })
    .select("id, order_id, rating, text, approved, created_at")
    .single();
  if (insertError || !review) {
    // A concurrent submit beat us to the one-review slot.
    if (insertError?.code === "23505") {
      return NextResponse.json(
        {
          error: "You have already reviewed this order. Thank you!",
          code: "ALREADY_REVIEWED",
        },
        { status: 409 },
      );
    }
    console.error("[reviews] insert failed:", insertError?.message);
    return NextResponse.json(
      { error: "Your review could not be saved. Please try again." },
      { status: 500 },
    );
  }

  return NextResponse.json(
    {
      mode: "live",
      review: {
        id: review.id,
        orderId: review.order_id,
        rating: review.rating,
        text: review.text,
        approved: review.approved,
        createdAt: review.created_at,
      },
    },
    { status: 201 },
  );
}
