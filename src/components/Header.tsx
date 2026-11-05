import Link from "next/link";
import { businessSettings, hasPhone } from "@/lib/config";

const navLinks = [
  { href: "/services", label: "Services" },
  { href: "/pricing", label: "Pricing" },
  { href: "/process", label: "How It Works" },
  { href: "/about", label: "About" },
  { href: "/faq", label: "FAQ" },
  { href: "/blog", label: "Blog" },
  { href: "/contact", label: "Contact" },
];

export default function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-brand-100 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link
          href="/"
          className="text-xl font-extrabold tracking-tight text-ink-900"
          aria-label="Z-clean — home"
        >
          Z<span className="text-brand-600">-clean</span>
        </Link>

        <nav aria-label="Primary" className="hidden items-center gap-5 lg:flex xl:gap-6">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-sm font-medium text-ink-700 transition-colors hover:text-brand-700"
            >
              {link.label}
            </Link>
          ))}
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
            href="/schedule-pickup"
            className="btn-press rounded-full bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-700"
          >
            Schedule Pickup
          </Link>
        </div>
      </div>

      <nav
        aria-label="Mobile"
        className="flex gap-5 overflow-x-auto border-t border-brand-50 px-4 py-2 lg:hidden"
      >
        {navLinks.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="whitespace-nowrap text-sm font-medium text-ink-700"
          >
            {link.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
