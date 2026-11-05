import { NextResponse } from "next/server";
import { loadApprovedReviews } from "@/lib/reviews-server";

/**
 * GET /api/reviews/approved — PUBLIC list of the latest approved
 * customer reviews (Delta 3), newest first, capped at
 * APPROVED_REVIEW_LIMIT. Privacy: each entry carries the reviewer's
 * FIRST NAME and the order's delivery AREA only — never an email,
 * phone or full name (see src/lib/reviews.ts).
 *
 * This is the same data the homepage Testimonials section renders
 * server-side. Until the first real review is approved — and whenever
 * the data layer is unavailable — the list is simply empty; there is
 * no placeholder content on this path either.
 */
export async function GET() {
  const reviews = await loadApprovedReviews();
  return NextResponse.json({ reviews });
}
