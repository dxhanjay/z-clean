/**
 * Customer reviews (Delta 3) — PURE helpers.
 *
 * The integrity contract for Sri Clean testimonials lives here and in
 * supabase/schema_v9.sql: a review exists only for a DELIVERED order,
 * one per order, written by the order's owner, and reaches the public
 * site only after staff approval. Nothing in this module (or anywhere
 * in the codebase) fabricates a review, a rating or a reviewer.
 */

export const REVIEW_RATING_MIN = 1;
export const REVIEW_RATING_MAX = 5;
export const REVIEW_TEXT_MIN = 3;
export const REVIEW_TEXT_MAX = 1000;

/** How many approved reviews the homepage / public API show at most. */
export const APPROVED_REVIEW_LIMIT = 12;

export interface ReviewEligibilityOrder {
  status: string;
}

export type ReviewEligibility =
  | { eligible: true }
  | {
      eligible: false;
      /** Stable machine code the API returns verbatim. */
      code: "ALREADY_REVIEWED" | "ORDER_NOT_DELIVERED";
      message: string;
    };

/**
 * May this order be reviewed right now? Mirrors the API's answers:
 * an order that already has a review answers ALREADY_REVIEWED (the
 * route maps the DB unique violation to the same code), and only a
 * DELIVERED order may be reviewed at all.
 */
export function reviewEligibility(
  order: ReviewEligibilityOrder,
  hasExistingReview: boolean,
): ReviewEligibility {
  if (hasExistingReview) {
    return {
      eligible: false,
      code: "ALREADY_REVIEWED",
      message: "You have already reviewed this order. Thank you!",
    };
  }
  if (order.status !== "DELIVERED") {
    return {
      eligible: false,
      code: "ORDER_NOT_DELIVERED",
      message:
        "Reviews open once your order has been delivered — tell us how it went after your laundry is back with you.",
    };
  }
  return { eligible: true };
}

/**
 * Public byline for a reviewer: FIRST NAME ONLY, never the full name,
 * email or phone. Stored names are kept as the customer typed them;
 * this takes the first whitespace-separated token. Blank or missing
 * names fall back to a neutral "Customer" — the review itself is
 * still real, only the byline is anonymous.
 */
export function reviewerFirstName(fullName: string | null | undefined): string {
  const first = (fullName ?? "").trim().split(/\s+/)[0] ?? "";
  return first || "Customer";
}

/** "★★★★☆" for a 1–5 rating; out-of-range values are clamped. */
export function starsFor(rating: number): string {
  const clamped = Math.min(
    REVIEW_RATING_MAX,
    Math.max(REVIEW_RATING_MIN, Math.round(rating) || REVIEW_RATING_MIN),
  );
  return "★".repeat(clamped) + "☆".repeat(REVIEW_RATING_MAX - clamped);
}

/** Display DTO for one approved review on the public site / API. */
export interface PublicReview {
  id: string;
  rating: number;
  text: string;
  createdAt: string;
  /** First name only — see reviewerFirstName. */
  reviewerName: string;
  /** The order's delivery area (e.g. "Sector 4 / City Centre") or null. */
  area: string | null;
}

interface JoinedName {
  name: string | null;
}

interface JoinedArea {
  area: string | null;
}

export interface ReviewRowWithJoins {
  id: string;
  rating: number;
  text: string;
  created_at: string;
  profiles: JoinedName | JoinedName[] | null;
  orders: { addresses: JoinedArea | JoinedArea[] | null } | null;
}

function firstOf<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

/**
 * Compose the public DTO from a reviews row joined with the reviewer's
 * profile name and the order's address area. PostgREST returns nested
 * relations as objects or one-element arrays depending on the join —
 * both shapes are normalised here.
 */
export function toPublicReview(row: ReviewRowWithJoins): PublicReview {
  const profile = firstOf(row.profiles);
  const address = firstOf(row.orders?.addresses ?? null);
  return {
    id: row.id,
    rating: row.rating,
    text: row.text,
    createdAt: row.created_at,
    reviewerName: reviewerFirstName(profile?.name),
    area: address?.area?.trim() ? address.area.trim() : null,
  };
}
