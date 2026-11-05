import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { ApiError, submitReview } from "../lib/api";
import { brand } from "../lib/config";
import type { OrderReview } from "../lib/types";
import { Field } from "./forms";
import { Card, PrimaryButton, styles } from "./ui";

/**
 * Review prompt on the order detail screen (Delta 3) — the mobile
 * twin of the web order page's form. Rendered only for DELIVERED
 * orders. The server enforces the real rules (owner + delivered +
 * one-per-order); this card just presents them kindly: an existing
 * review shows the thank-you state, a fresh submit explains that
 * reviews are checked by the team before they appear on the website.
 */

const STAR = "#f59e0b";

function Stars({ rating, onPick }: { rating: number; onPick?: (value: number) => void }) {
  return (
    <View style={{ flexDirection: "row", gap: 2 }}>
      {[1, 2, 3, 4, 5].map((value) => (
        <Pressable
          key={value}
          disabled={!onPick}
          onPress={() => onPick?.(value)}
          accessibilityRole={onPick ? "button" : undefined}
          accessibilityLabel={`${value} star${value === 1 ? "" : "s"}`}
          hitSlop={6}
        >
          <Text style={{ fontSize: 30, lineHeight: 34, color: value <= rating ? STAR : brand.tealBorder }}>
            ★
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

export default function ReviewCard({
  orderId,
  existingReview,
}: {
  orderId: string;
  existingReview: OrderReview | null;
}) {
  const [review, setReview] = useState<OrderReview | null>(existingReview);
  const [rating, setRating] = useState(0);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (review) {
    return (
      <Card>
        <Text style={styles.label}>Your review</Text>
        <Stars rating={review.rating} />
        <Text style={{ color: brand.ink, marginTop: 4 }}>“{review.text}”</Text>
        <Text style={styles.muted}>
          {review.approved
            ? "Thank you! Your review is live on our website."
            : "Thank you! Reviews are checked by our team before they appear on the website — yours is in the queue."}
        </Text>
      </Card>
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
      const created = await submitReview(orderId, rating, text.trim());
      setReview(created);
    } catch (err) {
      if (err instanceof ApiError && err.code === "ALREADY_REVIEWED") {
        // Another device submitted first — show the grateful state.
        setReview({
          id: "existing",
          rating,
          text: text.trim(),
          approved: false,
          createdAt: new Date().toISOString(),
        });
        return;
      }
      setError(err instanceof Error ? err.message : "Your review could not be saved. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <Text style={styles.label}>How did we do?</Text>
      <Text style={styles.muted}>
        Your order has been delivered. A few words from you help other Bokaro households
        decide — reviews are checked by our team before they appear on the website.
      </Text>
      <Stars rating={rating} onPick={setRating} />
      <Field
        label="Your review"
        value={text}
        onChangeText={setText}
        placeholder="What stood out — the pickup, the finish, the delivery?"
        multiline
        numberOfLines={4}
        maxLength={1000}
      />
      <Text style={[styles.muted, { textAlign: "left", fontSize: 12 }]}>{text.length}/1000</Text>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      <PrimaryButton label="Submit review" onPress={() => void submit()} busy={busy} />
    </Card>
  );
}
