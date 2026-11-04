"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Admin console shell (Gentelella-style redesign — an original
 * implementation of that classic dashboard layout in this codebase's
 * Tailwind stack; no template code is used).
 *
 * Structure: a dark slate sidebar (#2A3F54) with a logo block, the
 * signed-in admin's profile block, grouped menus and a footer; a slim
 * white topbar; and the page content on the light panel background.
 *
 * Responsive behaviour:
 *   - ≥1024px  full 232px sidebar, labels visible
 *   - 768–1023 icon rail, 72px, labels hidden (title tooltips)
 *   - <768px   sidebar hidden; the topbar hamburger opens a slide-over
 *              drawer with the full sidebar and a backdrop
 *
 * The admin gate itself stays server-side in src/app/admin/layout.tsx
 * (getAdminGate) — this component is pure presentation.
 */

interface MenuItem {
  href: string;
  label: string;
  icon: ReactNode;
  exact?: boolean;
}

interface MenuGroup {
  heading: string;
  items: MenuItem[];
}

function I({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5 shrink-0"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

const MENU: MenuGroup[] = [
  {
    heading: "Main",
    items: [
      {
        href: "/admin",
        label: "Dashboard",
        exact: true,
        icon: (
          <I>
            <rect x="3.5" y="3.5" width="7" height="7" rx="1.2" />
            <rect x="13.5" y="3.5" width="7" height="7" rx="1.2" />
            <rect x="3.5" y="13.5" width="7" height="7" rx="1.2" />
            <rect x="13.5" y="13.5" width="7" height="7" rx="1.2" />
          </I>
        ),
      },
      {
        href: "/admin/orders",
        label: "Orders",
        icon: (
          <I>
            <path d="M9 6h11M9 12h11M9 18h11" />
            <path d="M4 6h.01M4 12h.01M4 18h.01" strokeWidth={2.6} />
          </I>
        ),
      },
      {
        href: "/admin/stages",
        label: "Stage Queues",
        icon: (
          <I>
            <path d="M4 7h13l-3.2-3.2" />
            <path d="M20 17H7l3.2 3.2" />
          </I>
        ),
      },
    ],
  },
  {
    heading: "Management",
    items: [
      {
        href: "/admin/branches",
        label: "Branches",
        icon: (
          <I>
            <rect x="5" y="3" width="14" height="18" rx="1" />
            <path d="M9 7.2h2M13 7.2h2M9 11.2h2M13 11.2h2M9 15.2h2M13 15.2h2" />
            <path d="M10 21v-2.6h4V21" />
          </I>
        ),
      },
      {
        href: "/admin/employees",
        label: "Employees",
        icon: (
          <I>
            <circle cx="9" cy="8" r="3.4" />
            <path d="M3.2 20c.6-3.1 2.9-5 5.8-5s5.2 1.9 5.8 5" />
            <path d="M15.8 5.2a3.4 3.4 0 0 1 0 6" />
            <path d="M17.8 15.4c1.7.7 2.7 2.2 3 4.6" />
          </I>
        ),
      },
      {
        href: "/admin/vouchers",
        label: "Vouchers",
        icon: (
          <I>
            <path d="M3 8.5v-2A1.5 1.5 0 0 1 4.5 5h15A1.5 1.5 0 0 1 21 6.5v2a2.75 2.75 0 0 0 0 5.5v2a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 15.5v-2a2.75 2.75 0 0 0 0-5.5z" />
            <path d="M13.5 8v1.8M13.5 12.1v1.8M13.5 16.2V18" />
          </I>
        ),
      },
    ],
  },
  {
    heading: "Catalogue & Config",
    items: [
      {
        href: "/admin/pricing",
        label: "Pricing",
        icon: (
          <I>
            <path d="M3.5 3.5H12l8.5 8.5-8.5 8.5L3.5 12z" />
            <circle cx="8" cy="8" r="1.4" />
          </I>
        ),
      },
      {
        href: "/admin/settings",
        label: "Settings",
        icon: (
          <I>
            <path d="M4 7.2h9.5M17.8 7.2H20M4 16.8h3.8M12.2 16.8H20" />
            <circle cx="15.6" cy="7.2" r="2.2" />
            <circle cx="10" cy="16.8" r="2.2" />
          </I>
        ),
      },
    ],
  },
  {
    heading: "Finance",
    items: [
      {
        href: "/admin/finance",
        label: "Finance",
        icon: (
          <I>
            <rect x="2.5" y="6" width="19" height="12" rx="2" />
            <circle cx="12" cy="12" r="2.6" />
            <path d="M6.2 9.6h.01M17.8 14.4h.01" strokeWidth={2.6} />
          </I>
        ),
      },
      {
        href: "/admin/reports",
        label: "Reports",
        icon: (
          <I>
            <path d="M4 4v16h16" />
            <path d="M8.5 16v-4.5M12.5 16V8.5M16.5 16v-6.5" />
          </I>
        ),
      },
    ],
  },
];

function isItemActive(pathname: string, item: MenuItem): boolean {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

/** Topbar title for the current admin route. */
function sectionTitle(pathname: string): string {
  if (/^\/admin\/orders\/[^/]+$/.test(pathname)) return "Order detail";
  let best: MenuItem | null = null;
  for (const group of MENU) {
    for (const item of group.items) {
      if (isItemActive(pathname, item) && (!best || item.href.length > best.href.length)) {
        best = item;
      }
    }
  }
  return best?.label ?? "Admin";
}

function initialsOf(email: string | null): string {
  if (!email) return "Z";
  const first = email.trim().charAt(0).toUpperCase();
  return first || "Z";
}

function SidebarContent({
  email,
  pathname,
  full,
}: {
  email: string | null;
  pathname: string;
  /** true inside the mobile drawer: always show labels, full width. */
  full?: boolean;
}) {
  const labelCls = full ? "" : "hidden lg:inline";
  const groupHeadingCls = full ? "" : "hidden lg:block";
  const rowJustify = full ? "justify-start" : "justify-center lg:justify-start";
  const padX = full ? "px-5" : "px-3 lg:px-5";
  const navPadX = full ? "px-3" : "px-2.5 lg:px-3";

  const linkCls = (active: boolean) =>
    `relative flex min-h-[44px] items-center gap-3 rounded-md px-2.5 py-2 text-sm font-semibold transition-colors ${rowJustify} ${
      active
        ? "bg-white/10 text-white"
        : "text-white/60 hover:bg-white/5 hover:text-white"
    }`;

  return (
    <div className="flex h-full flex-col">
      {/* Logo block */}
      <div className={`flex items-center gap-2.5 py-5 ${padX}`}>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-admin-accent text-lg font-black text-white">
          Z
        </span>
        <span className={labelCls}>
          <span className="block text-[17px] font-extrabold leading-tight tracking-tight">
            Z-clean
          </span>
          <span className="block text-[10px] font-bold uppercase tracking-[0.18em] text-white/50">
            Admin Panel
          </span>
        </span>
      </div>

      {/* Profile block */}
      <div className={`flex items-center gap-3 border-y border-white/10 py-4 ${padX} ${rowJustify}`}>
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/15 text-sm font-extrabold text-white">
          {initialsOf(email)}
        </span>
        <span className={`min-w-0 ${labelCls}`}>
          <span className="block truncate text-sm font-bold text-white">
            {email ?? "Demo mode"}
          </span>
          <span className="block text-xs text-white/55">
            {email ? "Administrator" : "Not signed in"}
          </span>
        </span>
      </div>

      {/* Grouped menu */}
      <nav aria-label="Admin sections" className={`flex-1 overflow-y-auto py-4 ${navPadX}`}>
        {MENU.map((group) => (
          <div key={group.heading} className="mb-4 last:mb-0">
            <p
              className={`px-2 pb-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-white/40 ${groupHeadingCls}`}
            >
              {group.heading}
            </p>
            <ul className="grid gap-0.5">
              {group.items.map((item) => {
                const active = isItemActive(pathname, item);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      title={item.label}
                      aria-current={active ? "page" : undefined}
                      className={linkCls(active)}
                    >
                      {active && (
                        <span className="absolute inset-y-2 left-0 w-[3px] rounded-full bg-admin-accent" />
                      )}
                      {item.icon}
                      <span className={labelCls}>{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Footer: storefront + sign out */}
      <div className={`border-t border-white/10 py-3 ${navPadX}`}>
        <Link href="/" title="View storefront" className={linkCls(false)}>
          <I>
            <path d="M3.5 11 12 3.5 20.5 11" />
            <path d="M5.5 9.5V20a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1V9.5" />
          </I>
          <span className={labelCls}>View storefront</span>
        </Link>
        {email && (
          <form action="/auth/signout" method="post">
            <button
              type="submit"
              title="Sign out"
              className={`${linkCls(false)} w-full text-left`}
            >
              <I>
                <path d="M9 21H5.5A1.5 1.5 0 0 1 4 19.5v-15A1.5 1.5 0 0 1 5.5 3H9" />
                <path d="M16 16.5 20.5 12 16 7.5" />
                <path d="M20.5 12H9" />
              </I>
              <span className={labelCls}>Sign out</span>
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export default function AdminShell({
  email,
  children,
}: {
  email: string | null;
  children: ReactNode;
}) {
  const pathname = usePathname() ?? "/admin";
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Close the mobile drawer on navigation, and lock body scroll
  // while it is open.
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!drawerOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [drawerOpen]);

  return (
    <div className="min-h-screen bg-admin-panel">
      {/* Fixed sidebar: icon rail on md, full on lg+ */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[72px] bg-admin-sidebar md:block lg:w-[232px]">
        <SidebarContent email={email} pathname={pathname} />
      </aside>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            aria-label="Close admin menu"
            className="absolute inset-0 h-full w-full bg-ink-900/60"
            onClick={() => setDrawerOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 w-[264px] bg-admin-sidebar shadow-2xl">
            <SidebarContent email={email} pathname={pathname} full />
          </aside>
        </div>
      )}

      {/* Content column */}
      <div className="md:pl-[72px] lg:pl-[232px]">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-admin-border bg-white px-4 sm:px-6">
          <button
            type="button"
            aria-label="Open admin menu"
            onClick={() => setDrawerOpen(true)}
            className="btn-press -ml-1.5 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-ink-700 hover:bg-admin-panel md:hidden"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              className="h-6 w-6"
              aria-hidden="true"
            >
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          </button>
          <span className="text-base font-bold tracking-tight text-admin-heading">
            {sectionTitle(pathname)}
          </span>
          <div className="ml-auto flex items-center gap-3">
            <Link
              href="/"
              className="hidden text-sm font-semibold text-admin-muted transition-colors hover:text-brand-700 sm:block"
            >
              View storefront
            </Link>
            {email && (
              <span className="hidden max-w-[230px] truncate rounded-full bg-brand-50 px-3 py-1.5 text-xs font-bold text-brand-700 min-[420px]:block">
                {email}
              </span>
            )}
          </div>
        </header>

        <div className="mx-auto w-full max-w-[1200px] px-4 py-6 pb-20 sm:px-6 sm:py-8 lg:px-8">
          {children}
        </div>
      </div>
    </div>
  );
}
