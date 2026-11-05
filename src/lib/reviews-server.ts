import { createClient } from "@/lib/supabase/server";
import {
  APPROVED_REVIEW_LIMIT,
  toPublicReview,
  type PublicReview,
  type ReviewRowWithJoins,
} from "@/lib/reviews";

/**
 * Approved-review reads (Delta 3) — SERVER ONLY.
 *
 * The storefront's Testimonials section renders ONLY rows from the
 * reviews table with approved = true (written by real customers for
 * DELIVERED orders, then approved by staff — see schema_v9.sql). RLS
 * makes approved rows public-readable, so the plain anon/server
 * client is enough; there is no service-role read on this path.
 *
 * Every failure mode — Supabase unconfigured, table not yet created,
 * DB error, zero approved reviews — returns an EMPTY list, and the
 * section hides itself. There is deliberately no fallback content:
 * no reviews yet means no testimonials section, full stop.
 */
export async function loadApprovedReviews(
  limit: number = APPROVED_REVIEW_LIMIT,
): Promise<PublicReview[]> {
  const supabase = await createClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("reviews")
    .select(
      "id, rating, text, created_at, profiles ( name ), orders ( addresses ( area ) )",
    )
    .eq("approved", true)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error || !data) return [];

  return (data as unknown as ReviewRowWithJoins[]).map(toPublicReview);
}
