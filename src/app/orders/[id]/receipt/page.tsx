import type { Metadata } from "next";
import Receipt from "@/components/Receipt";

export const metadata: Metadata = {
  title: "Receipt — Z-clean",
};

/**
 * Printable receipt for one order (Phase 9). The page itself is a thin
 * shell; src/components/Receipt.tsx resolves the data (owner endpoint,
 * admin composition, or the demo store) and renders the bill.
 */
export default function ReceiptPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return <Receipt params={params} />;
}
