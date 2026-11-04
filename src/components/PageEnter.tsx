"use client";

import { usePathname } from "next/navigation";

/**
 * Page-enter transition (smoothness pass): keying the wrapper on the
 * pathname replays the short `.page-enter` fade/rise on every route
 * change. Purely presentational — children render unchanged.
 */
export default function PageEnter({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div key={pathname} className="page-enter">
      {children}
    </div>
  );
}
