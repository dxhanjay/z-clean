import { NextResponse } from "next/server";
import { getPricingTerms } from "@/lib/business-settings";
import { publicPricingTermsPayload } from "@/lib/pricing";

/**
 * GET /api/pricing-terms — public money terms for client apps.
 *
 * Returns the effective minimum order, free-delivery threshold and
 * delivery fee (integer paise), resolved from the admin-editable
 * settings with the approved constants as fallback (getPricingTerms).
 * The mobile app mirrors these into its local totals preview so an
 * admin settings edit can never desync app vs server checkout.
 * No auth: every value here is already printed on the public site.
 */
export async function GET() {
  const terms = await getPricingTerms();
  return NextResponse.json(publicPricingTermsPayload(terms), {
    headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" },
  });
}
