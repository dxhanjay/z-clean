import { NextResponse } from "next/server";
import { resolveRequestAuth } from "@/lib/supabase/request-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { pushRegisterSchema, pushUnregisterSchema } from "@/lib/validation";
import { isExpoPushToken } from "@/lib/push";
import { demoOrNotConfigured, notConfiguredResponse } from "@/lib/api-errors";

/**
 * /api/push/register — Expo push token lifecycle (Delta 2).
 *
 * POST   { token, platform } — register (or refresh) the caller's
 *        device token in `push_tokens` (supabase/schema_v8.sql).
 * DELETE { token }           — remove the caller's row for that
 *        token (logout hygiene / notifications turned off).
 *
 * Any signed-in user, cookie (web) or Bearer (mobile) — resolved by
 * resolveRequestAuth, exactly like /api/addresses.
 *
 * Writes go through the SERVICE-ROLE client once the caller is
 * authenticated, falling back to the caller's RLS client when no
 * service key is configured. The service role is deliberate for one
 * case RLS cannot express: a token is unique per device install, so
 * when a DIFFERENT account signs in on the same phone, registration
 * must reassign that token's row to the new user — an upsert the
 * previous owner's RLS policies would (correctly) hide. The row
 * written always carries the VERIFIED caller's user id, and DELETE
 * is always scoped to the caller's own rows, so the privileged
 * client can never touch another user's tokens.
 */
async function resolveCaller() {
  const auth = await resolveRequestAuth();
  if (auth.kind === "unconfigured") {
    return { response: demoOrNotConfigured({ mode: "demo" }) } as const;
  }
  if (auth.kind === "misconfigured") {
    return { response: notConfiguredResponse() } as const;
  }
  if (auth.kind !== "user") {
    return {
      response: NextResponse.json({ error: "Sign in required." }, { status: 401 }),
    } as const;
  }
  return { auth } as const;
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const parsed = pushRegisterSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Please fix the highlighted fields." },
      { status: 422 },
    );
  }
  if (!isExpoPushToken(parsed.data.token)) {
    return NextResponse.json(
      { error: "That does not look like an Expo push token.", code: "INVALID_PUSH_TOKEN" },
      { status: 422 },
    );
  }

  const resolved = await resolveCaller();
  if ("response" in resolved) return resolved.response;
  const { auth } = resolved;

  const writer = createAdminClient() ?? auth.supabase;
  const { error } = await writer.from("push_tokens").upsert(
    {
      user_id: auth.user.id,
      expo_push_token: parsed.data.token,
      platform: parsed.data.platform,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "expo_push_token" },
  );
  if (error) {
    console.error("[push/register] upsert failed:", error.message);
    return NextResponse.json(
      { error: "Could not register this device for notifications." },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const parsed = pushUnregisterSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Please fix the highlighted fields." },
      { status: 422 },
    );
  }

  const resolved = await resolveCaller();
  if ("response" in resolved) return resolved.response;
  const { auth } = resolved;

  const writer = createAdminClient() ?? auth.supabase;
  const { error } = await writer
    .from("push_tokens")
    .delete()
    .eq("expo_push_token", parsed.data.token)
    .eq("user_id", auth.user.id);
  if (error) {
    console.error("[push/register] delete failed:", error.message);
    return NextResponse.json(
      { error: "Could not remove this device's notification registration." },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true });
}
