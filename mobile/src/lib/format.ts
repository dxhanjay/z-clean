/**
 * Money + date formatting — mirrors the web app (src/lib/pricing.ts
 * formatPaise) so app and web always display amounts identically.
 */

/** Format integer paise for display, e.g. 29900 → "₹299", 26850 → "₹268.50". */
export function formatPaise(paise: number): string {
  const inr = paise / 100;
  return `₹${inr.toLocaleString("en-IN", {
    minimumFractionDigits: Number.isInteger(inr) ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Short date/time for order lists, e.g. "5 Nov, 9:00 AM". */
export function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

/** yyyy-mm-dd for the order API (local date, like the web form). */
export function toDateStr(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** Friendly label for a yyyy-mm-dd date, e.g. "Wed, 5 Nov". */
export function prettyDate(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}
