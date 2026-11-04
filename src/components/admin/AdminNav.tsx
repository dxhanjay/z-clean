"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * @deprecated Superseded by AdminShell (admin redesign): the console
 * now uses a sidebar + topbar shell, and this pill nav is no longer
 * rendered anywhere. Kept in the tree only because the snapshot-push
 * flow cannot delete files — safe to delete in any checkout with
 * normal git access.
 *
 * Admin section nav (Phase 7a) — rendered by the admin layout on every
 * admin screen: order queue, branches, employees. Pill links with a
 * 44px touch target, horizontally scrollable on small screens.
 *
 * Smoothness pass: the nav sticks under the site header. Offsets =
 * sticky site-header height (≈98px on mobile incl. its extra nav row,
 * ≈61px at ≥lg where that row is hidden).
 */
const LINKS = [
  { href: "/admin", label: "Order queue", exact: true },
  { href: "/admin/stages", label: "Stage Queues", exact: false },
  { href: "/admin/branches", label: "Branches", exact: false },
  { href: "/admin/employees", label: "Employees", exact: false },
  { href: "/admin/vouchers", label: "Vouchers", exact: false },
  { href: "/admin/pricing", label: "Pricing", exact: false },
  { href: "/admin/finance", label: "Finance", exact: false },
  { href: "/admin/reports", label: "Reports", exact: false },
  { href: "/admin/settings", label: "Settings", exact: false },
];

export default function AdminNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Admin sections" className="sticky top-[98px] z-30 border-b border-brand-100 bg-white/90 backdrop-blur lg:top-[61px]">
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
