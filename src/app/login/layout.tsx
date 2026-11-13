import type { Metadata } from "next";
import type { ReactNode } from "react";

// Route metadata for a client-component page (site-quality pass, Nov 2026):
// the page itself cannot export metadata, so its layout carries it.
export const metadata: Metadata = {
  title: "Log in",
  description: "Log in to your Sri Clean account to track orders, manage saved addresses and book laundry pickups in Bokaro Steel City.",
};

export default function Layout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
