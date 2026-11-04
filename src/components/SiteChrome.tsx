"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import PageEnter from "@/components/PageEnter";

/**
 * Storefront chrome switch (admin redesign).
 *
 * The public site wraps every page in the marketing Header/Footer.
 * The admin console (/admin and everything under it) is a separate
 * workspace with its own sidebar + topbar shell (AdminShell, rendered
 * by the admin layout), so the storefront chrome is skipped there —
 * URLs, metadata and page content are unchanged either way.
 *
 * Header/Footer are Server Components (the footer reads the business
 * settings), so they are rendered by the root layout and passed in as
 * props — this client component only decides whether to show them.
 */
export default function SiteChrome({
  header,
  footer,
  children,
}: {
  header: ReactNode;
  footer: ReactNode;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const isAdmin = pathname === "/admin" || (pathname?.startsWith("/admin/") ?? false);

  if (isAdmin) {
    return <main className="flex-1">{children}</main>;
  }

  return (
    <>
      {header}
      <main className="flex-1">
        <PageEnter>{children}</PageEnter>
      </main>
      {footer}
    </>
  );
}
