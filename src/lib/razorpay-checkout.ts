/**
 * Razorpay Checkout.js — shared types + script loader, used by the
 * order builder (Phase 3) and the order detail payment-retry action
 * (Phase 5a). Kept in one module because the `Window.Razorpay` global
 * augmentation must be declared exactly once in the program.
 *
 * Reminder: a Checkout handler/dismiss callback is cosmetic. An order
 * is only ever marked paid by the signature-verified webhook
 * (src/app/api/payments/webhook) — never by anything in this file.
 */

export interface RazorpayCheckoutOptions {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  order_id: string;
  prefill?: { name?: string; contact?: string };
  handler?: () => void;
  modal?: { ondismiss?: () => void };
  theme?: { color?: string };
}

export interface RazorpayInstance {
  open: () => void;
}

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayCheckoutOptions) => RazorpayInstance;
  }
}

/** Load checkout.js once; resolves false if it cannot be loaded. */
export function loadRazorpayScript(): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  if (window.Razorpay) return Promise.resolve(true);
  return new Promise((resolve) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}
