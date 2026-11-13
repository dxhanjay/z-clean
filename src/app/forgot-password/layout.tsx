import type { Metadata } from "next";
import type { ReactNode } from "react";

// Route metadata for a client-component page (site-quality pass, Nov 2026):
// the page itself cannot export metadata, so its layout carries it.
export const metadata: Metadata = {
  title: "Forgot password",
  description: "Request a secure password-reset link for your Sri Clean account.",
};

export default function Layout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
