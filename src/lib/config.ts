/**
 * Sri Clean business settings — SINGLE SOURCE OF TRUTH (client-safe subset).
 *
 * Every value here starts EMPTY on purpose. The real business details
 * (phone / WhatsApp, address, opening hours, service areas, prices and any
 * first-order offer) are pending input from the business owner and will be
 * stored in the database (`settings`, `service_areas` and `price_items`
 * tables — see supabase/schema.sql) and managed from the admin panel.
 *
 * Do NOT hardcode invented contact details, prices or offers in pages.
 * UI components must check these values and hide/placeholder gracefully
 * while they are empty.
 */
/**
 * Razorpay Payment Link (interim online-payment path, owner decision
 * 2026-11-04): the full Razorpay gateway setup (API keys + Checkout.js +
 * webhook, already built in Phase 3) is DEFERRED until the owner sets up
 * the Razorpay account. In the meantime the owner will create a Razorpay
 * Payment Link in the Razorpay dashboard (a public rzp.io / pages URL)
 * and paste it here — or set NEXT_PUBLIC_RAZORPAY_PAYMENT_LINK, which
 * takes precedence over the pasted value. While it is empty, the site
 * shows online payment as "setting up soon" and Pay on Delivery remains
 * the working payment path.
 */
const pastedRazorpayPaymentLink = "";

export const businessSettings = {
  /** Business display name. */
  name: "Sri Clean",
  tagline: "Laundry & dry cleaning, picked up and delivered.",

  /** Razorpay Payment Link — env override wins; see note above. */
  razorpayPaymentLink:
    process.env.NEXT_PUBLIC_RAZORPAY_PAYMENT_LINK?.trim() ||
    pastedRazorpayPaymentLink,

  /** DEMO placeholder (owner-confirmed 2026-11-04) — replace with the real business number before launch. */
  phone: "+91244567889",
  /** DEMO placeholder — same demo number as phone for now; replace before launch. */
  whatsapp: "+91244567889",
  /** TODO(owner): set when the business email is confirmed. */
  email: "",
  /** TODO(owner): store address, once a physical store exists. */
  address: "",
  /** TODO(owner): opening hours, once confirmed. */
  openingHours: "",
  /** Launch cities / areas live in the `service_areas` table, not here. */
  serviceAreasNote:
    "Our launch service areas will be announced here as soon as they are confirmed.",
} as const;

/** True once an owner-provided phone number has been configured. */
export const hasPhone = businessSettings.phone.trim().length > 0;

/** True once the owner has provided a Razorpay Payment Link. */
export const hasRazorpayPaymentLink =
  businessSettings.razorpayPaymentLink.trim().length > 0;
