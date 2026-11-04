"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Admin section nav (Phase 7a) — rendered by the admin layout on every
 * admin screen: order queue, branches, employees. Pill links with a
 * 44px touch target, horizontally scrollable on small screens.
 */
const LINKS = [
  { href: "/admin", label: "Order queue", exact: true },
  { href: "/admin/branches", label: "Branches", exact: false },
  { href: "/admin/employees", label: "Employees", exact: false },
];

export default function AdminNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Admin sections" className="border-b border-brand-100 bg-white">
      <div className="mx-auto flex max-w-6xl gap-2 overflow-x-auto px-4 py-3 sm:px-6">
        {LINKS.map((link) => {
          const active = link.exact
            ? pathname === link.href
            : pathname === link.href || pathname.startsWith(`${link.href}/`);
          return (
            <Link
              key={link.href}
              href={link.href}
              aria-current={active ? "page" : undefined}
              className={`inline-flex min-h-[44px] shrink-0 items-center rounded-full px-4 py-2 text-sm font-bold ${
                active
                  ? "bg-brand-600 text-white"
                  : "bg-brand-50 text-brand-700 hover:bg-brand-100"
              }`}
            >
              {link.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
