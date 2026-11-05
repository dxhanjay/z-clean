import { NextResponse } from "next/server";
import { resolveRequestAuth } from "@/lib/supabase/request-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminTier } from "@/lib/roles";

/**
 * GET /api/tracking/[orderId] — the customer tracking feed (the
 * customer map UI, Phase D, consumes this).
 *
 * Authorization: the order's OWNER or an admin tier — nobody else.
 * Identity is proven via resolveRequestAuth (cookie or Bearer); the
 * reads then run through the service role because assignments and
 * positions span tables a customer session cannot read directly.
 * The authorization check happens BEFORE any of those reads return
 * data, and the response carries no more than the map needs: the
 * rider's first name, the latest position, and coordinates — never
 * the rider's phone or the customer's own address details beyond
 * its pin.
 *
 * Positions exist only while a rider is actually sharing from the
 * staff app: `latestPosition` is null (and `lastPingAt` null) when
 * nobody has pinged — the UI must show "waiting for the rider"
 * rather than inventing a location.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ orderId: string }> },
) {
  const { orderId } = await params;

  const auth = await resolveRequestAuth();
  if (auth.kind === "misconfigured") {
    return NextResponse.json(
      { error: "NOT_CONFIGURED", message: "Server configuration error." },
      { status: 503 },
    );
  }
  if (auth.kind === "unconfigured") {
    return NextResponse.json(
      { mode: "demo", message: "Supabase not configured — demo mode." },
      { status: 503 },
    );
  }
  if (auth.kind !== "user") {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  const { supabase, user } = auth;

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json(
      { error: "NOT_CONFIGURED", message: "Server configuration error." },
      { status: 503 },
    );
  }

  const { data: order } = await admin
    .from("orders")
    .select("id, user_id, address_id, status")
    .eq("id", orderId)
    .maybeSingle();
  if (!order) {
    return NextResponse.json({ error: "Order not found." }, { status: 404 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  const isOwner = order.user_id === user.id;
  if (!isOwner && !isAdminTier(profile?.role as string | undefined)) {
    return NextResponse.json(
      { error: "You can only track your own orders.", code: "FORBIDDEN" },
      { status: 403 },
    );
  }

  // The current assignment: the active one when a leg is running,
  // else the most recent (so a just-delivered order still shows who
  // brought it and where they were last seen).
  const { data: assignmentRows } = await admin
    .from("order_assignments")
    .select("id, leg, employee_id, assigned_at, completed_at")
    .eq("order_id", orderId)
    .order("assigned_at", { ascending: false })
    .limit(5);
  const assignments = assignmentRows ?? [];
  const current =
    assignments.find((a) => a.completed_at === null) ?? assignments[0] ?? null;

  let riderFirstName: string | null = null;
  let facility: { name: string; lat: number; lng: number } | null = null;
  if (current) {
    const { data: rider } = await admin
      .from("employees")
      .select("full_name, branch_id")
      .eq("id", current.employee_id)
      .maybeSingle();
    if (rider?.full_name) {
      riderFirstName = String(rider.full_name).trim().split(/\s+/)[0] ?? null;
    }
    if (rider?.branch_id) {
      const { data: branch } = await admin
        .from("branches")
        .select("name, lat, lng")
        .eq("id", rider.branch_id)
        .maybeSingle();
      if (branch && branch.lat !== null && branch.lng !== null) {
        facility = {
          name: branch.name as string,
          lat: Number(branch.lat),
          lng: Number(branch.lng),
        };
      }
    }
  }
  if (!facility) {
    // Fallback: any active branch with a pin, plants first.
    const { data: branches } = await admin
      .from("branches")
      .select("name, type, lat, lng")
      .eq("active", true)
      .not("lat", "is", null)
      .not("lng", "is", null);
    const pinned = (branches ?? []).sort((a, b) =>
      a.type === "plant" ? -1 : b.type === "plant" ? 1 : 0,
    );
    if (pinned[0]) {
      facility = {
        name: pinned[0].name as string,
        lat: Number(pinned[0].lat),
        lng: Number(pinned[0].lng),
      };
    }
  }

  let latestPosition: {
    lat: number;
    lng: number;
    accuracyM: number | null;
    recordedAt: string;
  } | null = null;
  if (current) {
    const { data: ping } = await admin
      .from("rider_locations")
      .select("lat, lng, accuracy_m, recorded_at")
      .eq("assignment_id", current.id)
      .order("recorded_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (ping) {
      latestPosition = {
        lat: Number(ping.lat),
        lng: Number(ping.lng),
        accuracyM: ping.accuracy_m !== null ? Number(ping.accuracy_m) : null,
        recordedAt: ping.recorded_at as string,
      };
    }
  }

  let destination: { lat: number; lng: number } | null = null;
  if (order.address_id) {
    const { data: address } = await admin
      .from("addresses")
      .select("lat, lng, latitude, longitude")
      .eq("id", order.address_id)
      .maybeSingle();
    const lat = address?.lat ?? address?.latitude ?? null;
    const lng = address?.lng ?? address?.longitude ?? null;
    if (lat !== null && lng !== null && lat !== undefined && lng !== undefined) {
      destination = { lat: Number(lat), lng: Number(lng) };
    }
  }

  return NextResponse.json({
    mode: "live",
    order: {
      id: order.id,
      ref: String(order.id).slice(0, 8).toUpperCase(),
      status: order.status,
    },
    assignment: current
      ? {
          leg: current.leg,
          state: current.completed_at ? "completed" : "active",
          riderFirstName,
          assignedAt: current.assigned_at,
          completedAt: current.completed_at,
        }
      : null,
    latestPosition,
    lastPingAt: latestPosition?.recordedAt ?? null,
    facility,
    destination,
  });
}
