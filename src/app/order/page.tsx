import type { Metadata } from "next";
import OrderForm from "@/components/order/OrderForm";
import { loadStorefrontCatalogue } from "@/lib/catalogue-server";

// The form's catalogue must match the live price_items rows the
// server re-prices from — never bake it at build time.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Place an order",
  description:
    "Pick your items, tell us where to collect them, and pay online or on delivery — Z-clean laundry & dry cleaning in Bokaro Steel City.",
};

/**
 * Order page (server wrapper). The catalogue is loaded DB-first
 * (Phase 7b) and handed to the form, so the customer's live preview is
 * computed from the same price_items rows the server re-prices from —
 * an admin price edit can no longer desync the preview from checkout.
 */
export default async function OrderPage() {
  const { groups, entries } = await loadStorefrontCatalogue();
  return <OrderForm priceGroups={groups} entries={entries} />;
}
