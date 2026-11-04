import type { Metadata } from "next";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Z-clean — Laundry & Dry Cleaning with Pickup and Delivery",
    template: "%s | Z-clean",
  },
  description:
    "Z-clean is a laundry and dry-cleaning service with doorstep pickup and delivery. Wash & fold, dry cleaning, ironing, shoe and leather care — book online and track your order.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col">
        <Header />
        <main className="flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
