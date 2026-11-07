import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { pickupRequestSchema } from "@/lib/validation";
import { isPincodeServiceable } from "@/lib/pricing";
import { pickupSlotIso } from "@/lib/slot-time";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { demoOrNotConfigured } from "@/lib/api-errors";
import { isAccountDisabled } from "@/lib/roles";

/**
 * POST /api/pickups — schedule a pickup (Phase 2).
 *
 * Server-side validation mirrors the client form (zod), and the pincode is
 * re-checked against the serviceable list on the server — the client check
 * is UX only. When Supabase is configured the request is inserted into
 * `pickup_requests` (RLS applies). When it is NOT configured the route
 * answers 503 { mode: "demo" } (demo mode only — a misconfigured
 * production build gets 503 { error: "NOT_CONFIGURED" }, see
 * src/lib/data-mode.ts) and the client stores the request locally,
 * clearly labelled DEMO MODE — a save is never faked.
 *
 * P0: guest-reachable, so POST is rate limited per client IP
 * (10/hour, src/lib/rate-limit.ts, fails open).
 *
 * The slot label ("9 AM – 11 AM") is combined with the pickup date into a
 * local timestamp for the `pickup_slot` timestamptz column.
 */

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  // Rate limit (P0): this endpoint is open to guests, so it is capped
  // per client IP — 10 requests/hour. The limiter fails open, so a
  // counter outage never blocks a genuine pickup.
  if (!(await checkRateLimit(`pickups:ip:${getClientIp(request)}`, 10, 3600))) {
    return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });
  }

  const parsed = pickupRequestSchema.safeParse(body);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return NextResponse.json(
      { error: "Please fix the highlighted fields.", fieldErrors },
      { status: 422 },
    );
  }

  const data = parsed.data;

  if (!isPincodeServiceable(data.pincode)) {
    return NextResponse.json(
      {
        error:
          "Sorry, we are not serviceable at this pincode yet. We currently serve Bokaro Steel City (827001, 827003, 827004, 827006, 827009, 827010, 827013, 827014, 829301).",
        fieldErrors: { pincode: "Not serviceable yet" },
      },
      { status: 422 },
    );
  }

  const supabase = await createClient();
  if (!supabase) {
    return demoOrNotConfigured({
      mode: "demo",
      message: "Supabase not configured — demo mode.",
    });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Disabled accounts (Delta 1): signed-in customers an admin has
  // disabled cannot request pickups either. Guests have no account
  // to disable and are unaffected.
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("disabled")
      .eq("id", user.id)
      .maybeSingle();
    if (isAccountDisabled(profile)) {
      return NextResponse.json(
        {
          error: "ACCOUNT_DISABLED",
          message:
            "This account has been disabled and cannot request pickups. Please contact Sri Clean support if you think this is a mistake.",
        },
        { status: 403 },
      );
    }
  }

  const slotIso = pickupSlotIso(data.pickupDate, data.pickupSlot);

  // Guest requests (user_id NULL) can never pass the "read own or admin"
  // SELECT policy, so an insert chained with .select() fails its own
  // read-back under the caller's credentials (RLS 42501) even though the
  // insert policy allows the row — the guest would get a 500 for a request
  // that was actually accepted. For guests only, run the insert through
  // the server-only service-role client; the payload above is already
  // zod-validated and pincode-gated. Signed-in requests keep the normal
  // RLS-scoped client. Falls back to the user client when the
  // service-role client is not configured.
  const insertClient = user ? supabase : (createAdminClient() ?? supabase);

  const { data: row, error } = await insertClient
    .from("pickup_requests")
    .insert({
      user_id: user?.id ?? null,
      name: data.name,
      phone: data.phone,
      address_line: data.addressLine,
      area: data.area,
      city: data.city,
      pincode: data.pincode,
      services: data.services,
      pickup_slot: slotIso,
      delivery_type: data.deliveryType,
      note: data.note ? data.note : null,
    })
    .select("id, status, created_at")
    .single();

  if (error) {
    return NextResponse.json(
      { error: "Could not save your pickup request. Please try again." },
      { status: 500 },
    );
  }

  return NextResponse.json(
    { mode: "live", ref: row.id, status: row.status, createdAt: row.created_at },
    { status: 201 },
  );
}

export async function GET() {
  const supabase = await createClient();
  if (!supabase) {
    return demoOrNotConfigured({ mode: "demo", pickups: [] });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("pickup_requests")
    .select(
      "id, name, phone, address_line, area, city, pincode, services, pickup_slot, delivery_type, status, created_at",
    )
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json(
      { error: "Could not load your pickup requests." },
      { status: 500 },
    );
  }

  return NextResponse.json({ mode: "live", pickups: data ?? [] });
}
