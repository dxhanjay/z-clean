import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * SERVER-ONLY Supabase client with the service-role key. It bypasses Row
 * Level Security, so it must only be used in trusted server code paths:
 * the signature-verified Razorpay webhook (its caller has no user session).
 * Never import this from a Client Component and never expose the key.
 * Returns null when the service-role env vars are not configured.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return null;
  }
  return createSupabaseClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
