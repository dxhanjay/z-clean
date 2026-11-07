import type { Metadata } from "next";
import Link from "next/link";
import CtaBand from "@/components/CtaBand";

export const metadata: Metadata = {
  title: "Terms of service",
  description:
    "The terms that apply when you book laundry and dry-cleaning services with Sri Clean: pricing, pickup and delivery, cancellation and payment.",
};

/**
 * Terms of service — kept brief and consistent with what the product
 * actually enforces: unit pricing confirmed at pickup, Express at
 * 1.5x, cancellation only before pickup (the order state machine
 * allows CANCELLED only from PLACED / PICKUP_SCHEDULED), OTP-verified
 * handovers, pay online or on delivery.
 */
export default function TermsPage() {
  return (
    <>
      <section className="mx-auto max-w-4xl px-4 py-14 sm:px-6">
        <h1 className="text-3xl font-extrabold tracking-tight text-ink-900 sm:text-4xl">
          Terms of service
        </h1>
        <p className="mt-4 text-sm text-ink-500">
          Last updated: 4 November 2026
        </p>
        <p className="mt-5 text-base leading-relaxed text-ink-700">
          These terms apply when you book laundry or dry-cleaning services
          with Sri Clean, through our website or mobile app. By placing an
          order you agree to them.
        </p>

        <h2 className="mt-12 text-2xl font-extrabold tracking-tight text-ink-900">
          Orders and pricing
        </h2>
        <p className="mt-4 text-base leading-relaxed text-ink-700">
          Services are priced by unit — per kg, per piece, per pair or per
          sq ft — as shown on our{" "}
          <Link href="/pricing" className="font-semibold text-brand-700 hover:underline">
            pricing page
          </Link>
          . The total estimated when you book is confirmed at pickup, once
          your items are counted or weighed in front of you. Where Express
          service is offered, it is charged at 1.5 times the standard price,
          shown before you confirm. If an item needs treatment beyond the
          service you booked, we contact you first and only proceed with
          your approval.
        </p>

        <h2 className="mt-12 text-2xl font-extrabold tracking-tight text-ink-900">
          Pickup and delivery
        </h2>
        <p className="mt-4 text-base leading-relaxed text-ink-700">
          Please be available at the booked slot, or arrange for someone to
          hand over and receive your items. Handovers are verified with a
          one-time code sent for your order — the rider collects your items
          against the pickup code and delivers against the delivery code, so
          your laundry never goes to the wrong door.
        </p>

        <h2 className="mt-12 text-2xl font-extrabold tracking-tight text-ink-900">
          Cancellation and refunds
        </h2>
        <p className="mt-4 text-base leading-relaxed text-ink-700">
          You can cancel an order free of charge at any time before your
          items are picked up. Once items have been collected, the order can
          no longer be cancelled, because cleaning may already be under way —
          if something is wrong, contact us and we will do our best to help.
          If you paid in advance for an order you cancelled before pickup,
          the amount is refunded to the original payment method; other
          refund requests are reviewed case by case and, once approved, are
          processed back to you. Items that come back below our quality
          standard are re-processed free — tell us promptly through your
          account or the contact page.
        </p>

        <h2 className="mt-12 text-2xl font-extrabold tracking-tight text-ink-900">
          Payment, vouchers and offers
        </h2>
        <p className="mt-4 text-base leading-relaxed text-ink-700">
          You can pay online when you book or pay on delivery. An order is
          marked paid only after the payment is confirmed — for online
          payments, by our payment provider. Gift vouchers are prepaid and
          can be used until their balance runs out; promotional codes apply
          as described at checkout, and a coupon and a promotional voucher
          cannot be combined on the same order.
        </p>

        <h2 className="mt-12 text-2xl font-extrabold tracking-tight text-ink-900">
          Your account
        </h2>
        <p className="mt-4 text-base leading-relaxed text-ink-700">
          You are responsible for keeping your sign-in details safe and for
          the orders placed from your account. Tell us through the{" "}
          <Link href="/contact" className="font-semibold text-brand-700 hover:underline">
            contact page
          </Link>{" "}
          if you believe your account has been used without your permission.
          Our handling of your information is described in the{" "}
          <Link href="/privacy" className="font-semibold text-brand-700 hover:underline">
            privacy policy
          </Link>
          .
        </p>

        <h2 className="mt-12 text-2xl font-extrabold tracking-tight text-ink-900">
          Changes
        </h2>
        <p className="mt-4 text-base leading-relaxed text-ink-700">
          We may update these terms as the service develops; the current
          version always applies to new orders and is dated at the top of
          this page.
        </p>
      </section>
      <CtaBand
        title="Anything unclear?"
        text="Ask us through the contact page before you book — we would rather explain a term than surprise you with it."
      />
    </>
  );
}
