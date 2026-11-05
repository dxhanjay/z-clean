"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

/**
 * Topbar bell (Delta 1) — shows the HIGH-severity count from
 * GET /api/admin/notifications as a badge. Rendered only for live
 * admins (the layout passes it in); any fetch failure hides the
 * bell silently — a broken badge must never break the shell. The
 * full list lives at /admin/notifications.
 */
export default function AdminNotificationBell() {
  const [high, setHigh] = useState(0);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/notifications");
      if (!res.ok) return;
      const json = await res.json().catch(() => null);
      setHigh(Number(json?.counts?.high ?? 0));
    } catch {
      // Silent by design (see header).
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 120_000);
    return () => window.clearInterval(timer);
  }, [load]);

  return (
    <Link
      href="/admin/notifications"
      title={
        high > 0
          ? `${high} high-priority notification${high === 1 ? "" : "s"}`
          : "Notifications"
      }
      aria-label={
        high > 0
          ? `Notifications — ${high} high priority`
          : "Notifications"
      }
      className="btn-press relative inline-flex h-11 w-11 items-center justify-center rounded-lg text-ink-700 hover:bg-admin-panel"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-[22px] w-[22px]"
        aria-hidden="true"
      >
        <path d="M18.5 15.5h-13l1.7-2.6V10a4.8 4.8 0 0 1 9.6 0v2.9z" />
        <path d="M10 18.5a2.1 2.1 0 0 0 4 0" />
        <path d="M12 3.2a7.4 7.4 0 0 1 5.3 2.3" opacity={0.55} />
      </svg>
      {high > 0 && (
        <span className="absolute right-1 top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-extrabold text-white">
          {high > 99 ? "99+" : high}
        </span>
      )}
    </Link>
  );
}
