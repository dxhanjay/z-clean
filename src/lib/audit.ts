import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Audit log helper (Phase 7a) — SERVER ONLY.
 *
 * Every staff/admin mutation in live mode writes one `audit_logs` row
 * (actor, action, entity, change details) — this trail is what later
 * powers employee-performance and voucher reports (Requirements v2 §4).
 *
 * The helper NEVER throws into the caller's flow: an audit failure is
 * logged to the server console and swallowed, so a bookkeeping problem
 * can never break the operation it was recording. RLS still applies —
 * the insert policy only accepts rows whose actor_user_id is the
 * caller's own auth id.
 */
export interface AuditEntry {
  /** The signed-in account performing the action (auth user id). */
  actorUserId: string;
  /** Human-readable actor name kept even if the account is removed. */
  actorLabel?: string | null;
  /** Dotted action name, e.g. "branch.create", "employee.update". */
  action: string;
  /** Table / domain object, e.g. "branches", "employees". */
  entity: string;
  /** Primary key of the affected row, as text. */
  entityId?: string | null;
  /** Change details — typically { before, after } or the created values. */
  details?: Record<string, unknown>;
}

export async function logAudit(
  supabase: SupabaseClient,
  entry: AuditEntry,
): Promise<void> {
  try {
    const { error } = await supabase.from("audit_logs").insert({
      actor_user_id: entry.actorUserId,
      actor_label: entry.actorLabel ?? null,
      action: entry.action,
      entity: entry.entity,
      entity_id: entry.entityId ?? null,
      details: entry.details ?? {},
    });
    if (error) {
      console.error(
        `[audit] could not record ${entry.action} on ${entry.entity}: ${error.message}`,
      );
    }
  } catch (err) {
    console.error(
      `[audit] could not record ${entry.action} on ${entry.entity}:`,
      err,
    );
  }
}
