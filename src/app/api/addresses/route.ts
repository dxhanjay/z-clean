import { NextResponse } from "next/server";
import { resolveRequestAuth } from "@/lib/supabase/request-auth";
import { addressSchema } from "@/lib/validation";
import { isPincodeServiceable } from "@/lib/pricing";
import { demoOrNotConfigured, notConfiguredResponse } from "@/lib/api-errors";

/**
 * /api/addresses — saved customer addresses (Phase 2).
 * Live mode requires a signed-in user; RLS in supabase/schema.sql restricts
 * rows to their owner. Without Supabase env vars the route answers
 * 503 { mode: "demo" } and the dashboard falls back to the clearly labelled
 * localStorage demo store.
 *
 * Auth resolves through resolveRequestAuth (P0 bearer parity): the web
 * cookie session OR a validated Bearer token from the mobile app —
 * the resolved client carries the caller's identity, so RLS applies
 * identically either way. Cookie-session behaviour is unchanged.
 */

export async function GET() {
  const auth = await resolveRequestAuth();
  if (auth.kind === "unconfigured") {
    return demoOrNotConfigured({ mode: "demo", addresses: [] });
  }
  if (auth.kind === "misconfigured") {
    return notConfiguredResponse();
  }
  if (auth.kind !== "user") {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  const { supabase } = auth;

  const { data, error } = await supabase
    .from("addresses")
    .select("id, label, line, area, city, pincode, created_at")
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json(
      { error: "Could not load your addresses." },
      { status: 500 },
    );
  }

  return NextResponse.json({ mode: "live", addresses: data ?? [] });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const parsed = addressSchema.safeParse(body);
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

  if (!isPincodeServiceable(parsed.data.pincode)) {
    return NextResponse.json(
      {
        error: "That pincode is outside our current Bokaro Steel City service area.",
        fieldErrors: { pincode: "Not serviceable yet" },
      },
      { status: 422 },
    );
  }

  const auth = await resolveRequestAuth();
  if (auth.kind === "unconfigured") {
    return demoOrNotConfigured({
      mode: "demo",
      message: "Supabase not configured — demo mode.",
    });
  }
  if (auth.kind === "misconfigured") {
    return notConfiguredResponse();
  }
  if (auth.kind !== "user") {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  const { supabase, user } = auth;

  const { data: row, error } = await supabase
    .from("addresses")
    .insert({
      user_id: user.id,
      label: parsed.data.label,
      line: parsed.data.line,
      area: parsed.data.area,
      city: parsed.data.city,
      pincode: parsed.data.pincode,
    })
    .select("id, label, line, area, city, pincode, created_at")
    .single();

  if (error) {
    return NextResponse.json(
      { error: "Could not save this address. Please try again." },
      { status: 500 },
    );
  }

  return NextResponse.json({ mode: "live", address: row }, { status: 201 });
}
