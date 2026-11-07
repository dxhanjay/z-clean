import type { Metadata } from "next";
import Link from "next/link";
import CtaBand from "@/components/CtaBand";
import { getBusinessSettings } from "@/lib/business-settings";

export const metadata: Metadata = {
  title: "Privacy policy",
  description:
    "How Sri Clean collects, uses and protects your information when you book laundry and dry-cleaning pickups with us.",
};

/**
 * Privacy policy — describes only what the product actually does
 * today: account/order data in Supabase, the website on Vercel,
 * pay-on-delivery, and online payments confirmed by the payment
 * provider. The phone number is read through getBusinessSettings()
 * (settings table first, config fallback), same as the contact page.
 * No business email is published: none is configured in settings.
 */
export default async function PrivacyPage() {
  const contact = await getBusinessSettings();

  return (
    <>
      <section className="mx-auto max-w-4xl px-4 py-14 sm:px-6">
        <h1 className="text-3xl font-extrabold tracking-tight text-ink-900 sm:text-4xl">
          Privacy policy
        </h1>
        <p className="mt-4 text-sm text-ink-500">
          Last updated: 4 November 2026
        </p>
        <p className="mt-5 text-base leading-relaxed text-ink-700">
          This page explains what information Sri Clean collects when you use
          our website or mobile app, why we need it, and the choices you
          have. We collect the minimum needed to collect, clean and return
          your laundry — nothing more.
        </p>

        <h2 className="mt-12 text-2xl font-extrabold tracking-tight text-ink-900">
          What we collect
        </h2>
        <ul className="mt-4 list-disc space-y-2 pl-6 text-base leading-relaxed text-ink-700">
          <li>
            <strong>Account details</strong> — your name, email address and
            phone number when you register, so we can run your account and
            contact you about your orders.
          </li>
          <li>
            <strong>Addresses</strong> — the pickup and delivery addresses
            you save or enter when booking.
          </li>
          <li>
            <strong>Order details</strong> — the services and items in each
            order, counts or weights confirmed at pickup, the order&apos;s
            status history, and the one-time codes used to verify handover
            at pickup and delivery.
          </li>
          <li>
            <strong>Payment records</strong> — how much was paid, by which
            method, and the resulting payment status. If you pay online, the
            payment itself is processed by our payment provider and we
            receive the confirmation and a payment reference — we never see
            or store your full card details. You can also pay on delivery.
          </li>
          <li>
            <strong>Voucher balances</strong> — if you hold a Sri Clean gift
            voucher, its balance and the transactions against it.
          </li>
        </ul>

        <h2 className="mt-12 text-2xl font-extrabold tracking-tight text-ink-900">
          Why we use it
        </h2>
        <p className="mt-4 text-base leading-relaxed text-ink-700">
          We use this information to fulfil your orders (pickup, cleaning,
          delivery and the handover checks in between), to run your account
          and show you your order history, to answer your questions, to keep
          payment and invoice records, and to prevent fraud and abuse of the
          service. Members of our operations team see the details they need
          for the orders they handle — for example, the rider collecting
          your order sees your name, address and phone number.
        </p>

        <h2 className="mt-12 text-2xl font-extrabold tracking-tight text-ink-900">
          Who processes it for us
        </h2>
        <p className="mt-4 text-base leading-relaxed text-ink-700">
          We do not sell your information. Two service providers process it
          on our behalf: <strong>Supabase</strong>, which hosts our database
          and account sign-in, and <strong>Vercel</strong>, which hosts this
          website. Online payments, when you choose them, are processed by
          our payment provider. We would only disclose information beyond
          this if the law required it.
        </p>

        <h2 className="mt-12 text-2xl font-extrabold tracking-tight text-ink-900">
          How long we keep it
        </h2>
        <p className="mt-4 text-base leading-relaxed text-ink-700">
          We keep your account and order records while your account is
          active, so your history, receipts and voucher balances stay
          available to you. You can ask us to delete your account and
          personal information at any time through the{" "}
          <Link href="/contact" className="font-semibold text-brand-700 hover:underline">
            contact page
          </Link>
          . Some records — such as invoices and payment entries — may need
          to be kept longer where the law or accounting rules require it.
        </p>

        <h2 className="mt-12 text-2xl font-extrabold tracking-tight text-ink-900">
          Cookies
        </h2>
        <p className="mt-4 text-base leading-relaxed text-ink-700">
          We use only the cookies needed to keep you signed in and the site
          working. We do not use advertising or third-party tracking
          cookies.
        </p>

        <h2 className="mt-12 text-2xl font-extrabold tracking-tight text-ink-900">
          Keeping it safe, and children
        </h2>
        <p className="mt-4 text-base leading-relaxed text-ink-700">
          Passwords are stored hashed by our sign-in provider, access to
          order and payment data is restricted by account role, and staff
          actions in our admin system are recorded in an audit log. Sri Clean
          is a household service for adults; it is not directed at children.
        </p>

        <h2 className="mt-12 text-2xl font-extrabold tracking-tight text-ink-900">
          Questions and changes
        </h2>
        <p className="mt-4 text-base leading-relaxed text-ink-700">
          If anything here is unclear, or you want to see, correct or delete
          your information, reach us through the{" "}
          <Link href="/contact" className="font-semibold text-brand-700 hover:underline">
            contact page
          </Link>
          {contact.hasPhone ? (
            <>
              {" "}
              or call us on{" "}
              <a
                href={`tel:${contact.phone.replace(/\s/g, "")}`}
                className="font-semibold text-brand-700 hover:underline"
              >
                {contact.phone}
              </a>
            </>
          ) : null}
          . If we change this policy, we will update this page and the date
          at the top.
        </p>
      </section>
      <CtaBand
        title="Questions about your data?"
        text="Message us through the contact page and we will help — whether it is about an order, your account, or deleting your information."
      />
    </>
  );
}
