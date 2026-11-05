"use client";

import { useCallback, useEffect, useState } from "react";
import { starsFor } from "@/lib/reviews";
import { Skeleton } from "@/components/Skeleton";

/**
 * Review moderation queue (Delta 3). Live mode reads
 * GET /api/admin/reviews?filter=… and mutates via PATCH (approve /
 * un-approve) and DELETE on /api/admin/reviews/[id]; every mutation
 * is audit-logged server-side (review.approve / review.reject /
 * review.delete).
 *
 * Demo mode has no reviews backend (reviews belong to live orders in
 * the database), so it shows an honest explainer instead of sample
 * reviews — sample testimonials are exactly what this feature exists
 * to avoid.
 */

interface AdminReview {
  id: string;
  orderId: string;
  orderRef: string;
  rating: number;
  text: string;
  approved: boolean;
  createdAt: string;
  reviewerName: string | null;
  area: string | null;
  city: string | null;
}

type Filter = "pending" | "approved" | "all";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "all", label: "All" },
];

export default function AdminReviews({
  mode,
  canModerate,
}: {
  mode: "live" | "demo";
  canModerate: boolean;
}) {
  const [filter, setFilter] = useState<Filter>("pending");
  const [reviews, setReviews] = useState<AdminReview[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (mode === "demo") {
      setReviews([]);
      return;
    }
    setLoadError(null);
    try {
      const res = await fetch(`/api/admin/reviews?filter=${filter}`);
      const json = (await res.json().catch(() => ({}))) as {
        reviews?: AdminReview[];
        error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? "load failed");
      setReviews(json.reviews ?? []);
    } catch {
      setLoadError("Could not load reviews. Please try again.");
    }
  }, [filter, mode]);

  useEffect(() => {
    void load();
  }, [load]);

  async function moderate(review: AdminReview, approved: boolean) {
    setBusyId(review.id);
    setActionError(null);
    try {
      const res = await fetch(`/api/admin/reviews/${review.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approved }),
      });
      if (!res.ok) throw new Error("patch failed");
      await load();
    } catch {
      setActionError("That change could not be saved. Please try again.");
    } finally {
      setBusyId(null);
    }
  }

  async function remove(review: AdminReview) {
    if (
      !window.confirm(
        "Delete this review permanently? Approving/un-approving is reversible; deletion is not.",
      )
    ) {
      return;
    }
    setBusyId(review.id);
    setActionError(null);
    try {
      const res = await fetch(`/api/admin/reviews/${review.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("delete failed");
      await load();
    } catch {
      setActionError("That review could not be deleted. Please try again.");
    } finally {
      setBusyId(null);
    }
  }

  if (mode === "demo") {
    return (
      <div className="rounded-xl border border-admin-border bg-white p-6 text-sm leading-relaxed text-admin-muted">
        Reviews live in the database with their orders, so the
        moderation queue needs the live connection. No sample reviews
        are shown here — the queue only ever contains what real
        customers actually wrote.
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Review filter">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            role="tab"
            aria-selected={filter === f.key}
            onClick={() => setFilter(f.key)}
            className={`btn-press rounded-full px-4 py-2 text-sm font-bold ${
              filter === f.key
                ? "bg-admin-sidebar text-white"
                : "border border-admin-border bg-white text-ink-700 hover:bg-admin-panel"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {actionError && (
        <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {actionError}
        </p>
      )}

      {reviews === null && !loadError && (
        <div className="mt-6 grid gap-4">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-28 w-full rounded-xl" />
          ))}
        </div>
      )}
      {loadError && (
        <p role="alert" className="mt-6 text-sm font-semibold text-red-600">
          {loadError}{" "}
          <button type="button" onClick={() => void load()} className="underline">
            Retry
          </button>
        </p>
      )}
      {reviews !== null && reviews.length === 0 && !loadError && (
        <div className="mt-6 rounded-xl border border-admin-border bg-white p-6 text-sm text-admin-muted">
          {filter === "pending"
            ? "Nothing waiting. New reviews from delivered orders land here first."
            : "No reviews in this view yet."}
        </div>
      )}

      <div className="mt-6 grid gap-4">
        {(reviews ?? []).map((review) => (
          <article
            key={review.id}
            className="rounded-xl border border-admin-border bg-white p-5"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-amber-500" aria-label={`Rated ${review.rating} out of 5`}>
                  <span aria-hidden="true" className="tracking-widest">
                    {starsFor(review.rating)}
                  </span>
                </p>
                <p className="mt-1 text-sm font-bold text-admin-heading">
                  {review.reviewerName ?? "Customer"}
                  <span className="ml-2 font-semibold text-admin-muted">
                    Order {review.orderRef}
                    {review.area ? ` · ${review.area}` : ""}
                    {review.city ? `, ${review.city}` : ""}
                  </span>
                </p>
                <p className="text-xs text-admin-muted">
                  {new Date(review.createdAt).toLocaleString("en-IN", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </p>
              </div>
              <span
                className={`rounded-full px-3 py-1 text-xs font-bold ${
                  review.approved
                    ? "bg-green-50 text-green-700"
                    : "bg-amber-50 text-amber-800"
                }`}
              >
                {review.approved ? "Live on site" : "Pending"}
              </span>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-ink-700">
              “{review.text}”
            </p>
            {canModerate && (
              <div className="mt-4 flex flex-wrap gap-2">
                {review.approved ? (
                  <button
                    type="button"
                    disabled={busyId === review.id}
                    onClick={() => void moderate(review, false)}
                    className="btn-press rounded-full border border-admin-border px-4 py-2 text-sm font-bold text-ink-700 hover:bg-admin-panel disabled:opacity-60"
                  >
                    Un-approve
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={busyId === review.id}
                    onClick={() => void moderate(review, true)}
                    className="btn-press rounded-full bg-admin-accent px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
                  >
                    Approve &amp; publish
                  </button>
                )}
                <button
                  type="button"
                  disabled={busyId === review.id}
                  onClick={() => void remove(review)}
                  className="btn-press rounded-full border border-red-200 px-4 py-2 text-sm font-bold text-red-700 hover:bg-red-50 disabled:opacity-60"
                >
                  Delete
                </button>
              </div>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}
