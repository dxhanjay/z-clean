"use client";

import { useState } from "react";
import { starsFor } from "@/lib/reviews";

/**
 * Review form on the order detail page (Delta 3) — LIVE orders only.
 *
 * Rendered only for a DELIVERED order. It posts to /api/reviews; the
 * review is born unapproved, so the success state says plainly that
 * the team checks reviews before they appear on the website (the
 * moderation step is an integrity feature, not a delay tactic — the
 * customer is told about it up front, before they write a word).
 */

export interface ExistingReview {
  rating: number;
  text: string;
  approved: boolean;
}

export default function ReviewForm({
  orderId,
  existingReview,
}: {
  orderId: string;
  existingReview: ExistingReview | null;
}) {
  const [review, setReview] = useState<ExistingReview | null>(existingReview);
  const [rating, setRating] = useState(0);
  const [hovered, setHovered] = useState(0);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (review) {
    return (
      <div className="mt-6 rounded-[2rem] bg-white p-6 shadow-soft ring-1 ring-mist-200/70">
        <h2 className="font-bold text-ink-900">Your review</h2>
        <p className="mt-2 text-amber-500" aria-label={`You rated ${review.rating} out of 5`}>
          <span aria-hidden="true" className="text-lg tracking-widest">{starsFor(review.rating)}</span>
        </p>
        <p className="mt-2 text-sm leading-relaxed text-ink-700">“{review.text}”</p>
        <p role="status" className="mt-3 text-sm leading-relaxed text-ink-500">
          {review.approved
            ? "Thank you! Your review is live on our website."
            : "Thank you! Reviews are checked by our team before they appear on the website — yours is in the queue."}
        </p>
      </div>
    );
  }

  async function submit() {
    setError(null);
    if (rating < 1) {
      setError("Please choose a star rating.");
      return;
    }
    if (text.trim().length < 3) {
      setError("Please write a few words about your order.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, rating, text: text.trim() }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        code?: string;
        review?: { rating: number; text: string; approved: boolean };
      };
      if (res.status === 409 || (res.ok && json.review)) {
        setReview(
          json.review ?? { rating, text: text.trim(), approved: false },
        );
        return;
      }
      setError(
        json.error ?? "Your review could not be saved. Please try again.",
      );
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  const active = hovered || rating;

  return (
    <div className="mt-6 rounded-[2rem] bg-white p-6 shadow-soft ring-1 ring-mist-200/70">
      <h2 className="font-bold text-ink-900">How did we do?</h2>
      <p className="mt-1.5 text-sm leading-relaxed text-ink-500">
        Your order has been delivered. A few words from you help other
        Bokaro households decide — reviews are checked by our team
        before they appear on the website.
      </p>

      <div className="mt-4" role="radiogroup" aria-label="Your rating">
        {[1, 2, 3, 4, 5].map((value) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={rating === value}
            aria-label={`${value} star${value === 1 ? "" : "s"}`}
            onClick={() => setRating(value)}
            onMouseEnter={() => setHovered(value)}
            onMouseLeave={() => setHovered(0)}
            className={`px-0.5 text-3xl leading-none transition-colors ${
              value <= active ? "text-amber-500" : "text-brand-100"
            }`}
          >
            ★
          </button>
        ))}
      </div>

      <label className="mt-4 block">
        <span className="sr-only">Your review</span>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          maxLength={1000}
          placeholder="What stood out — the pickup, the finish, the delivery?"
          className="w-full rounded-xl border border-brand-100 bg-white px-4 py-3 text-sm leading-relaxed text-ink-900 placeholder:text-ink-500/70 focus:border-brand-400 focus:outline-none"
        />
      </label>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-ink-500">{text.length}/1000</p>
        <button
          type="button"
          onClick={() => void submit()}
          disabled={busy}
          className="btn-press rounded-full bg-brand-600 px-6 py-2.5 text-sm font-bold text-white hover:bg-brand-700 disabled:opacity-60"
        >
          {busy ? "Saving…" : "Submit review"}
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-3 text-sm font-semibold text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
