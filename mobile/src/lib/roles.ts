/**
 * Tiered admin roles (Delta 1) — the mobile mirror of the web's
 * src/lib/roles.ts. The profile role comes from the database; these
 * helpers only decide what the app SHOWS. The server re-checks the
 * tier on every admin API call (403 FORBIDDEN_ROLE), so a tampered
 * client gains nothing.
 *
 *   customer (0) < ops_manager (1) < admin (2) < super_admin (3)
 */

export const ROLE_LEVEL: Record<string, number> = {
  customer: 0,
  ops_manager: 1,
  admin: 2,
  super_admin: 3,
};

export const ROLE_LABELS: Record<string, string> = {
  customer: "Customer",
  ops_manager: "Operations Manager",
  admin: "Admin",
  super_admin: "Super Admin",
};

export function roleLevel(role: string | null | undefined): number {
  return role ? (ROLE_LEVEL[role] ?? 0) : 0;
}

export function roleLabel(role: string | null | undefined): string {
  return (role && ROLE_LABELS[role]) || "Customer";
}

/** Any tier allowed into the admin console at all. */
export function isAdminTier(role: string | null | undefined): boolean {
  return roleLevel(role) >= 1;
}
