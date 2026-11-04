import { NextResponse } from "next/server";
import { getDataMode } from "./data-mode";

/**
 * Shared API responses for the "no data layer" states (P0 hardening).
 *
 * SERVER ONLY (NextResponse). Customer-facing routes historically
 * answered 503 { mode: "demo" } whenever Supabase env vars were
 * absent; since the demo fail-closed change, that answer is only
 * correct when demo mode is legitimately active. A misconfigured
 * production build gets the explicit NOT_CONFIGURED error instead.
 */

/** 503 for a production deployment missing its configuration. */
export function notConfiguredResponse() {
  return NextResponse.json(
    { error: "NOT_CONFIGURED", message: "Server configuration error." },
    { status: 503 },
  );
}

/**
 * The route is unreachable because there is no live data layer:
 * demo mode → the caller's established 503 demo body; misconfigured
 * production → NOT_CONFIGURED.
 */
export function demoOrNotConfigured(demoBody: Record<string, unknown>) {
  if (getDataMode() === "misconfigured") return notConfiguredResponse();
  return NextResponse.json(demoBody, { status: 503 });
}
