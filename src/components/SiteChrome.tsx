"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import PageEnter from "@/components/PageEnter";
import AmbientBackground from "@/components/AmbientBackground";

/**
 * Storefront chrome switch (admin redesign).
 *
 * The public site wraps every page in the marketing Header/Footer.
 * The admin console (/admin and everything under it) is a separate
 * workspace with its own sidebar + topbar shell (AdminShell, rendered
 * by the admin layout), so the storefront chrome is skipped there —
 * and likewise for the staff web app (/staff), which renders its own
 * minimal top bar in the staff layout. (The invite landing page,
 * /staff/set-password, keeps the storefront chrome so a brand-new
 * rider sees the familiar Z-clean frame.)
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
  const isStaffApp =
    (pathname === "/staff" || (pathname?.startsWith("/staff/") ?? false)) &&
    pathname !== "/staff/set-password";

  if (isAdmin || isStaffApp) {
    return <main className="flex-1">{children}</main>;
  }

  // Glass + 3D scroll pass: the ambient backdrop belongs to the
  // public marketing experience only. Customer task flows (/order,
  // /orders, /dashboard, auth) keep their crisp solid surfaces, so
  // the layer mounts on the homepage and the marketing/legal shells.
  const showAmbient =
    pathname === "/" ||
    MARKETING_ROUTES.some(
      (route) => pathname === route || pathname?.startsWith(`${route}/`),
    );

  return (
    <>
      {showAmbient && <AmbientBackground />}
      <div className="relative z-10 flex flex-1 flex-col">
        {header}
        <main className="flex-1">
          <PageEnter>{children}</PageEnter>
        </main>
        {footer}
      </div>
    </>
  );
}

const MARKETING_ROUTES = [
  "/services",
  "/pricing",
  "/blog",
  "/about",
  "/process",
  "/faq",
  "/contact",
  "/app",
  "/privacy",
  "/terms",
];
