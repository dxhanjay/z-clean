"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

/**
 * Staff shell header — the bar riders see on every staff page.
 *
 * Scroll rule copied from the marketing header, per the owner's
 * direction: glass at the very top (nothing scrolls under it
 * there), SOLID white with a soft shadow once the page scrolls,
 * so content passing underneath can never collide with the bar's
 * text. The Web3D pass shipped this bar glass at all times, and
 * while a rider scrolled the task detail the page headings slid
 * under the translucent bar and ran into the logo badge — this
 * component exists to make that impossible. One passive scroll
 * listener, no other behaviour; the sign-out form and the admin
 * support banner render exactly as they did in the layout (the
 * banner sits inside the header, so it inherits the solid
 * backing once scrolled).
 */
export default function StaffHeader({
  displayName,
  supportView,
}: {
  displayName: string;
  supportView: boolean;
}) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`sticky top-0 z-40 transition-[background-color,box-shadow] duration-300 ${
        scrolled
          ? "border-b border-ink-900/5 bg-white shadow-[0_10px_36px_rgba(23,43,66,0.10)]"
          : "glass-strong"
      }`}
    >
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <Link href="/staff" className="flex min-h-12 items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-600 text-base font-extrabold text-white">
            Z
          </span>
          <span className="leading-tight">
            <span className="block text-sm font-extrabold text-ink-900">
              Z-clean Staff
            </span>
            <span className="block text-xs text-ink-500">{displayName}</span>
          </span>
        </Link>
        <form action="/auth/signout" method="post">
          <button
            type="submit"
            className="btn-press glass-chip min-h-12 rounded-full px-4 py-2 text-xs font-bold text-ink-700"
          >
            Sign out
          </button>
        </form>
      </div>
      {supportView && (
        <p className="border-t border-amber-200/70 bg-amber-50/85 px-4 py-1.5 text-center text-xs font-semibold text-amber-800">
          Support view — you are seeing every rider&apos;s active rounds.
          Location sharing and handovers stay rider-only.
        </p>
      )}
    </header>
  );
}
