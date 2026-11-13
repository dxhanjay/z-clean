import type { Metadata } from "next";
import type { ReactNode } from "react";

// Route metadata for a client-component page (site-quality pass, Nov 2026):
// the page itself cannot export metadata, so its layout carries it.
export const metadata: Metadata = {
  title: "Create your account",
  description: "Create a Sri Clean account for laundry and dry-cleaning pickup and delivery across Bokaro Steel City.",
};

export default function Layout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
