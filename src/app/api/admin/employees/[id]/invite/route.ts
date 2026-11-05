import { NextResponse } from "next/server";
import { getAdminGate, roleGateError } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSiteUrl } from "@/lib/site-url";
import { logAudit } from "@/lib/audit";

/**
 * POST /api/admin/employees/[id]/invite — give an employee access to
 * the Staff Web App (Staff Web App phase, admin tier).
 *
 * The lifecycle:
 *   1. The employee record must carry an email — without one there is
 *      nowhere to invite (422 NO_EMAIL, surfaced honestly in the UI).
 *   2. Supabase Auth `inviteUserByEmail` (service role) emails a link
 *      that lands on /staff/set-password, where the rider sets their
 *      password (the same machinery as password reset — the redirect
 *      URL must be on the Supabase Auth allowlist, like /reset-password).
 *   3. The new auth user is linked: employees.user_id = the user, and
 *      profiles.role = 'staff'. The role is set HERE (not by a
 *      trigger) and stays unless a super_admin changes it from Team
 *      & Roles. 'staff' never passes the admin gate — every staff
 *      power comes from order assignments.
 *
 * Idempotent-ish, per spec: an employee who is already linked returns
 * state "already_linked" (no second invite is sent). If the email
 * already belongs to an EXISTING auth user (a customer account, say),
 * Supabase refuses a fresh invite — we then link that existing user
 * instead and say so (state "linked_existing"); they sign in with
 * their existing password and can reset it if forgotten.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const gate = await getAdminGate();
  if (gate.kind === "misconfigured") {
    return NextResponse.json(
      { error: "NOT_CONFIGURED", message: "Server configuration error." },
      { status: 503 },
    );
  }
  if (gate.kind === "demo") {
    return NextResponse.json(
      { mode: "demo", message: "Supabase not configured — demo mode." },
      { status: 503 },
    );
  }
  if (gate.kind === "unauthenticated") {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  if (gate.kind === "forbidden") {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }
  const roleErr = roleGateError(gate, "admin");
  if (roleErr) return roleErr;

  const { supabase, user } = gate;

  const { data: employee, error: loadError } = await supabase
    .from("employees")
    .select("id, full_name, email, user_id, employment_status")
    .eq("id", id)
    .maybeSingle();
  if (loadError || !employee) {
    return NextResponse.json({ error: "Employee not found." }, { status: 404 });
  }

  if (employee.user_id) {
    return NextResponse.json({
      mode: "live",
      state: "already_linked",
      employeeId: id,
      userId: employee.user_id,
      message: `${employee.full_name} already has staff app access.`,
    });
  }

  const email = (employee.email as string | null)?.trim() ?? "";
  if (!email) {
    return NextResponse.json(
      {
        error:
          "This employee has no email address on file — add one before inviting them to the staff app.",
        code: "NO_EMAIL",
      },
      { status: 422 },
    );
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json(
      { error: "NOT_CONFIGURED", message: "Server configuration error." },
      { status: 503 },
    );
  }

  const redirectTo = `${getSiteUrl(request)}/staff/set-password`;

  let invitedUserId: string | null = null;
  let state: "invited" | "linked_existing" = "invited";

  const { data: inviteData, error: inviteError } =
    await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo,
      data: { employee_id: id, full_name: employee.full_name },
    });

  if (inviteError || !inviteData?.user) {
    // The common recoverable failure: the email already has an auth
    // account. Link that account instead of failing the invite.
    const message = inviteError?.message ?? "";
    const looksExisting =
      /already|registered|exists/i.test(message) || inviteError?.status === 422;
    if (!looksExisting) {
      return NextResponse.json(
        {
          error: `The invite email could not be sent: ${message || "unknown error"}`,
          code: "INVITE_FAILED",
        },
        { status: 502 },
      );
    }
    const { data: list, error: listError } = await admin.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });
    if (listError) {
      return NextResponse.json(
        {
          error:
            "That email already has an account, but it could not be looked up for linking. Try again.",
          code: "INVITE_FAILED",
        },
        { status: 502 },
      );
    }
    const existing = list.users.find(
      (u) => u.email?.toLowerCase() === email.toLowerCase(),
    );
    if (!existing) {
      return NextResponse.json(
        {
          error: `The invite could not be sent: ${message}`,
          code: "INVITE_FAILED",
        },
        { status: 502 },
      );
    }
    invitedUserId = existing.id;
    state = "linked_existing";
  } else {
    invitedUserId = inviteData.user.id;
  }

  // Link the employee record and stamp the profile role. Both writes
  // go through the service role: the profiles row belongs to the NEW
  // user (the caller's RLS client may not touch it), and this trusted
  // path has already established who is being linked and why.
  const { error: linkError } = await admin
    .from("employees")
    .update({ user_id: invitedUserId, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (linkError) {
    return NextResponse.json(
      {
        error:
          "The invite was sent but the employee record could not be linked. Ask the rider to set their password, then link the account from the employee editor.",
        code: "LINK_FAILED",
      },
      { status: 500 },
    );
  }

  const { error: roleError } = await admin
    .from("profiles")
    .update({ role: "staff" })
    .eq("id", invitedUserId);
  if (roleError) {
    // The auth-side profile row is created by the signup trigger; if
    // it is somehow absent the link still stands — surface honestly.
    console.error(
      `[invite] could not set staff role for user ${invitedUserId}: ${roleError.message}`,
    );
  }

  await logAudit(supabase, {
    actorUserId: user.id,
    actorLabel: user.email ?? null,
    action: "employee.invite",
    entity: "employees",
    entityId: id,
    details: { state, email, userId: invitedUserId },
  });

  return NextResponse.json({
    mode: "live",
    state,
    employeeId: id,
    userId: invitedUserId,
    message:
      state === "invited"
        ? `Invite sent to ${email}. ${employee.full_name} sets a password from the email link and can then sign in to the staff app.`
        : `${email} already had an account — it is now linked to ${employee.full_name} with staff access. No new invite email was sent.`,
  });
}
