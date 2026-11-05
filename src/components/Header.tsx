"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { businessSettings, hasPhone } from "@/lib/config";
import { services } from "@/lib/services";

/**
 * Site header (Phase A redesign) — glassy translucent sticky bar:
 * logo, Services dropdown (the real services catalogue), Pricing,
 * Blog, Track (the signed-in dashboard), Help (FAQ), and a pill
 * "Get the App" button for the /app page. The mobile strip keeps the
 * same destinations in a scrollable row.
 */

const navLinkCls =
  "text-sm font-medium text-ink-700 transition-colors hover:text-brand-700";

export default function Header() {
  const [servicesOpen, setServicesOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  // Close the dropdown on navigation and on Escape / outside click.
  useEffect(() => {
    setServicesOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!servicesOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setServicesOpen(false);
    };
    const onPointerDown = (e: PointerEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setServicesOpen(false);
      }
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [servicesOpen]);

  return (
    <header className="glass-strong sticky top-0 z-40">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link
          href="/"
          className="text-xl font-extrabold tracking-tight text-ink-900"
          aria-label="Z-clean — home"
        >
          Z<span className="text-brand-600">-clean</span>
        </Link>

        <nav aria-label="Primary" className="hidden items-center gap-6 lg:flex">
          <div
            ref={dropdownRef}
            className="relative"
            onMouseEnter={() => setServicesOpen(true)}
            onMouseLeave={() => setServicesOpen(false)}
          >
            <button
              type="button"
              aria-expanded={servicesOpen}
              aria-haspopup="true"
              onClick={() => setServicesOpen((open) => !open)}
              className={`flex items-center gap-1 ${navLinkCls}`}
            >
              Services
              <span
                aria-hidden="true"
                className={`text-[10px] leading-none transition-transform duration-300 ${
                  servicesOpen ? "rotate-180" : ""
                }`}
              >
                ▼
              </span>
            </button>
            <div
              className={`absolute left-1/2 top-full w-[34rem] -translate-x-1/2 pt-3 transition-all duration-200 ${
                servicesOpen
                  ? "visible translate-y-0 opacity-100"
                  : "invisible -translate-y-1 opacity-0"
              }`}
            >
              <div className="glass-strong overflow-hidden rounded-[1.75rem]">
                <ul className="grid grid-cols-2 gap-1 p-3">
                  {services.map((service) => (
                    <li key={service.slug}>
                      <Link
                        href={`/services/${service.slug}`}
                        className="block rounded-2xl px-4 py-3 transition-colors hover:bg-mist-100"
                      >
                        <span className="block text-sm font-bold text-ink-900">
                          {service.name}
                        </span>
                        <span className="mt-0.5 block text-xs text-ink-500">
                          Priced {service.unitLabel}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
                <div className="flex items-center justify-between border-t border-mist-100 bg-mist-50 px-6 py-3">
                  <Link
                    href="/services"
                    className="text-sm font-semibold text-brand-700 hover:text-brand-800"
                  >
                    View all services →
                  </Link>
                  <Link
                    href="/process"
                    className="text-sm font-semibold text-ink-700 hover:text-brand-700"
                  >
                    How it works
                  </Link>
                </div>
              </div>
            </div>
          </div>

          <Link href="/pricing" className={navLinkCls}>
            Pricing
          </Link>
          <Link href="/blog" className={navLinkCls}>
            Blog
          </Link>
          <Link href="/dashboard" className={navLinkCls}>
            Track
          </Link>
          <Link href="/faq" className={navLinkCls}>
            Help
          </Link>
        </nav>

        <div className="flex items-center gap-2 sm:gap-3">
          {hasPhone && (
            <a
              href={`tel:${businessSettings.phone.replace(/\s/g, "")}`}
              className="hidden text-sm font-semibold text-brand-700 md:block"
            >
              {businessSettings.phone}
            </a>
          )}
          <Link
            href="/login"
            className="rounded-full px-3 py-2 text-sm font-semibold text-ink-700 transition-colors hover:text-brand-700"
          >
            Log in
          </Link>
          <Link
            href="/app"
            className="btn-press rounded-full bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-soft transition-colors hover:bg-brand-700"
          >
            Get the App
          </Link>
        </div>
      </div>

      <nav
        aria-label="Mobile"
        className="flex gap-5 overflow-x-auto border-t border-mist-100 px-4 py-2 lg:hidden"
      >
        <Link href="/services" className="whitespace-nowrap text-sm font-medium text-ink-700">
          Services
        </Link>
        <Link href="/pricing" className="whitespace-nowrap text-sm font-medium text-ink-700">
          Pricing
        </Link>
        <Link href="/blog" className="whitespace-nowrap text-sm font-medium text-ink-700">
          Blog
        </Link>
        <Link href="/dashboard" className="whitespace-nowrap text-sm font-medium text-ink-700">
          Track
        </Link>
        <Link href="/faq" className="whitespace-nowrap text-sm font-medium text-ink-700">
          Help
        </Link>
        <Link href="/about" className="whitespace-nowrap text-sm font-medium text-ink-700">
          About
        </Link>
        <Link href="/contact" className="whitespace-nowrap text-sm font-medium text-ink-700">
          Contact
        </Link>
      </nav>
    </header>
  );
}
