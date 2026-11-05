/**
 * Tiered admin roles (Delta 1) — PURE.
 *
 * `profiles.role` (Postgres enum `user_role`, extended by
 * supabase/schema_v7.sql) is the single source of truth for what a
 * signed-in account may do in the admin panel:
 *
 *   customer (0)    — storefront only; the admin gate rejects them.
 *   ops_manager (1) — day-to-day operations: queues, order status,
 *                     handovers, voucher redemption, desk payments,
 *                     refund REQUESTS, closings VIEW, reports.
 *   admin (2)       — everything ops can do, plus money/config
 *                     mutations: pricing & settings edits, staff and
 *                     branch management, expenses, day closing,
 *                     refund approve/process, voucher create/void,
 *                     customer disable/enable, team list (read-only).
 *   super_admin (3) — everything admin can do, plus changing other
 *                     accounts' roles (the only super_admin power).
 *
 * The matrix is enforced SERVER-SIDE per route (src/lib/admin.ts +
 * roleGateError); the web shell and the mobile app only use these
 * levels to decide what to SHOW. The full per-route matrix is in the
 * README, "Delta 1 — admin extensions".
 */

export const USER_ROLES = [
  "customer",
  "ops_manager",
  "admin",
  "super_admin",
] as const;

export type UserRole = (typeof USER_ROLES)[number];

export const ROLE_LEVEL: Record<UserRole, number> = {
  customer: 0,
  ops_manager: 1,
  admin: 2,
  super_admin: 3,
};

export const ROLE_LABELS: Record<UserRole, string> = {
  customer: "Customer",
  ops_manager: "Operations Manager",
  admin: "Admin",
  super_admin: "Super Admin",
};

/** The lowest tier that may enter the admin panel at all. */
export const ADMIN_PANEL_MIN_ROLE: UserRole = "ops_manager";

export function isUserRole(value: unknown): value is UserRole {
  return (
    typeof value === "string" &&
    (USER_ROLES as readonly string[]).includes(value)
  );
}

/** Numeric level of any stored role value; unknown values are 0. */
export function roleLevel(role: string | null | undefined): number {
  return isUserRole(role) ? ROLE_LEVEL[role] : 0;
}

/** True when `role` sits at or above the `min` tier. */
export function hasRole(
  role: string | null | undefined,
  min: UserRole,
): boolean {
  return roleLevel(role) >= ROLE_LEVEL[min];
}

/** Alias kept for call-site readability ("at least an admin"). */
export const atLeast = hasRole;

/** True for every tier allowed through the admin gate. */
export function isAdminTier(role: string | null | undefined): boolean {
  return hasRole(role, ADMIN_PANEL_MIN_ROLE);
}

/** Human label for a stored role value; unknown values read as Customer. */
export function roleLabel(role: string | null | undefined): string {
  return isUserRole(role) ? ROLE_LABELS[role] : ROLE_LABELS.customer;
}

/* ------------------------------------------------------------------ */
/* Disabled customer accounts (Delta 1)                                */
/* ------------------------------------------------------------------ */

/**
 * A disabled account may still sign in (order history and support
 * stay reachable) but may not place orders or pickup requests —
 * POST /api/orders and POST /api/pickups answer
 * 403 { error: "ACCOUNT_DISABLED" }. See README, Delta 1.
 */
export function isAccountDisabled(
  profile: { disabled?: boolean | null } | null | undefined,
): boolean {
  return profile?.disabled === true;
}

/* ------------------------------------------------------------------ */
/* Role-change guard (used by PATCH /api/admin/users/[id])             */
/* ------------------------------------------------------------------ */

export type RoleChangeVerdict =
  | { ok: true }
  | {
      ok: false;
      /** Stable machine code the API returns verbatim. */
      code: "FORBIDDEN_ROLE" | "SELF_DEMOTION" | "LAST_SUPER_ADMIN";
      message: string;
    };

/**
 * Decide whether a role change may proceed. Rules, in order:
 *   1. Only a super_admin may change roles at all.
 *   2. Nobody may demote THEMSELVES — another super_admin must do it,
 *      so an account can never lock itself out of recovery by fat
 *      fingers (promoting yourself is impossible anyway: rule 1
 *      means the actor is already at the top).
 *   3. The LAST super_admin cannot be demoted — the business must
 *      always keep one account able to manage roles.
 */
export function canChangeRole(input: {
  actorRole: string | null | undefined;
  actorId: string;
  targetId: string;
  targetCurrentRole: string | null | undefined;
  newRole: UserRole;
  /** Current number of super_admin accounts (including the target). */
  superAdminCount: number;
}): RoleChangeVerdict {
  if (!hasRole(input.actorRole, "super_admin")) {
    return {
      ok: false,
      code: "FORBIDDEN_ROLE",
      message: "Only a Super Admin can change account roles.",
    };
  }
  const isSelf = input.actorId === input.targetId;
  if (isSelf && roleLevel(input.newRole) < roleLevel(input.targetCurrentRole)) {
    return {
      ok: false,
      code: "SELF_DEMOTION",
      message:
        "You cannot lower your own role. Ask another Super Admin to make this change.",
    };
  }
  if (
    isUserRole(input.targetCurrentRole) &&
    input.targetCurrentRole === "super_admin" &&
    input.newRole !== "super_admin" &&
    input.superAdminCount <= 1
  ) {
    return {
      ok: false,
      code: "LAST_SUPER_ADMIN",
      message:
        "This is the last Super Admin account. Promote another account to Super Admin before demoting it.",
    };
  }
  return { ok: true };
}
