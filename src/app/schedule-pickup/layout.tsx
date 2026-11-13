import type { Metadata } from "next";
import type { ReactNode } from "react";

// Route metadata for a client-component page (site-quality pass, Nov 2026):
// the page itself cannot export metadata, so its layout carries it.
export const metadata: Metadata = {
  title: "Schedule a pickup",
  description: "Book a laundry pickup in Bokaro Steel City: pick a date and slot and Sri Clean collects from your doorstep.",
};

export default function Layout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
