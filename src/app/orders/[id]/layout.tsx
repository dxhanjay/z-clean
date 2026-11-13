import type { Metadata } from "next";
import type { ReactNode } from "react";

// Route metadata for a client-component page (site-quality pass, Nov 2026):
// the page itself cannot export metadata, so its layout carries it.
export const metadata: Metadata = {
  title: "Order details",
  description: "Live status, handover timeline and payment details for your Sri Clean order.",
};

export default function Layout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
