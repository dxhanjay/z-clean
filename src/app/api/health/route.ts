import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/health — liveness + database reachability (P0 hardening).
 *
 * No auth: this is the endpoint uptime monitors poll. It answers only
 * whether the app is up and the database answers a trivial query —
 * never versions, env details or error text.
 *
 *   200 { status: "ok",       db: true,  time } — app up, DB reachable
 *   503 { status: "degraded", db: false, time } — DB unreachable or
 *         the data layer is not configured at all
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const time = new Date().toISOString();

  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json(
      { status: "degraded", db: false, time },
      { status: 503 },
    );
  }

  // Cheapest possible probe: a head-only count on the publicly
  // readable settings table; the rows themselves are never read.
  const { error } = await supabase
    .from("settings")
    .select("key", { count: "exact", head: true });

  if (error) {
    return NextResponse.json(
      { status: "degraded", db: false, time },
      { status: 503 },
    );
  }

  return NextResponse.json({ status: "ok", db: true, time });
}
