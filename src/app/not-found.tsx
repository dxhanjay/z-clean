import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Page not found",
  description:
    "That page has gone out with the wash. Head back to Sri Clean's home, browse services, or track your order.",
};

/**
 * Branded 404 (site-quality pass, Nov 2026). Lives at the app root, so it
 * deliberately does not rely on the (site) group chrome — it renders its
 * own minimal shell with the logo and the three most useful next steps.
 */
export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-brand-50 px-4 py-16">
      <div className="w-full max-w-lg rounded-3xl border border-brand-100 bg-white p-8 text-center shadow-sm sm:p-12">
        <Link href="/" className="inline-block" aria-label="Sri Clean — back to home">
          <Image
            src="/logo.png"
            alt="Sri Clean (Dry Cleaning)"
            width={1024}
            height={288}
            className="h-14 w-auto"
            priority
          />
        </Link>
        <p className="mt-8 text-sm font-bold uppercase tracking-[0.2em] text-brand-600">404</p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-ink-900">
          This page went out with the wash
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-ink-500">
          The page you&rsquo;re looking for doesn&rsquo;t exist or has moved. Your laundry,
          thankfully, is easier to track than this URL.
        </p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <Link
            href="/"
            className="btn-press rounded-full bg-brand-600 px-6 py-3 text-sm font-bold text-white hover:bg-brand-700"
          >
            Back to home
          </Link>
          <Link
            href="/services"
            className="btn-press rounded-full border border-brand-200 px-6 py-3 text-sm font-semibold text-brand-700 hover:bg-brand-50"
          >
            Browse services
          </Link>
          <Link
            href="/dashboard"
            className="btn-press rounded-full border border-brand-200 px-6 py-3 text-sm font-semibold text-brand-700 hover:bg-brand-50"
          >
            Track your order
          </Link>
        </div>
      </div>
    </main>
  );
}
