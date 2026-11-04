import type { Metadata, Viewport } from "next";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SiteChrome from "@/components/SiteChrome";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Z-clean — Laundry & Dry Cleaning with Pickup and Delivery",
    template: "%s | Z-clean",
  },
  description:
    "Z-clean is a laundry and dry-cleaning service with doorstep pickup and delivery. Wash & fold, dry cleaning, ironing, shoe and leather care — book online and track your order.",
  // PWA (Mobile Phase 1): the manifest itself comes from
  // src/app/manifest.ts (served at /manifest.webmanifest, linked
  // automatically). Icons: SVG for browsers/install prompts, PNG
  // apple-touch icon for iOS home screens (scripts/generate-icons.mjs).
  icons: {
    icon: "/icons/icon.svg",
    apple: "/icons/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    title: "Z-clean",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  themeColor: "#22786d",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col">
        <SiteChrome header={<Header />} footer={<Footer />}>
          {children}
        </SiteChrome>
      </body>
    </html>
  );
}
