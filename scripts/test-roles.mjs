/**
 * Tiered admin role tests (Delta 1) — plain node, no test framework.
 * Compiles src/lib/roles.ts with the project's own TypeScript into a
 * scratch dir, then asserts the level maths, the tier helpers, the
 * disabled-account predicate, and the role-change guard (super-admin
 * only / no self-demotion / never demote the last super admin) that
 * PATCH /api/admin/users/[id] relies on.
 * Run: `npm run test:roles`. Exits non-zero if any check fails.
 */
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const scratch = mkdtempSync(join(tmpdir(), "zclean-roles-test-"));

try {
  const tscBin = join(projectRoot, "node_modules", ".bin", "tsc");
  execFileSync(
    tscBin,
    [
      "src/lib/roles.ts",
      "--module", "commonjs",
      "--target", "es2022",
      "--moduleResolution", "node",
      "--skipLibCheck",
      "--outDir", scratch,
    ],
    { cwd: projectRoot, stdio: "inherit" },
  );

  const require = createRequire(import.meta.url);
  const {
    ROLE_LEVEL,
    roleLevel,
    hasRole,
    isAdminTier,
    isUserRole,
    roleLabel,
    isAccountDisabled,
    canChangeRole,
  } = require(join(scratch, "roles.js"));

  let passed = 0;
  const failures = [];
  function check(name, condition, detail = "") {
    if (condition) {
      passed += 1;
      console.log(`  PASS ${name}`);
    } else {
      failures.push(name);
      console.log(`  FAIL ${name} ${detail}`);
    }
  }
  function eq(name, actual, expected) {
    check(name, actual === expected, `(expected ${expected}, got ${actual})`);
  }

  // 1 · The level ladder is exactly customer < ops < admin < super.
  eq("level: customer", ROLE_LEVEL.customer, 0);
  eq("level: ops_manager", ROLE_LEVEL.ops_manager, 1);
  eq("level: admin", ROLE_LEVEL.admin, 2);
  eq("level: super_admin", ROLE_LEVEL.super_admin, 3);
  eq("roleLevel: stored admin", roleLevel("admin"), 2);
  eq("roleLevel: null is 0", roleLevel(null), 0);
  eq("roleLevel: garbage is 0", roleLevel("root"), 0);

  // 2 · hasRole / isAdminTier boundaries.
  check("customer is not panel tier", !isAdminTier("customer"));
  check("ops_manager is panel tier", isAdminTier("ops_manager"));
  check("admin is panel tier", isAdminTier("admin"));
  check("super_admin is panel tier", isAdminTier("super_admin"));
  check("unknown role is not panel tier", !isAdminTier("superuser"));
  check("ops passes ops minimum", hasRole("ops_manager", "ops_manager"));
  check("ops fails admin minimum", !hasRole("ops_manager", "admin"));
  check("admin passes ops minimum", hasRole("admin", "ops_manager"));
  check("admin fails super minimum", !hasRole("admin", "super_admin"));
  check("super passes every minimum", hasRole("super_admin", "super_admin"));

  // 3 · Value guards and labels.
  check("isUserRole: admin", isUserRole("admin"));
  check("isUserRole: rejects junk", !isUserRole("ADMIN"));
  eq("roleLabel: ops", roleLabel("ops_manager"), "Operations Manager");
  eq("roleLabel: unknown reads Customer", roleLabel("???"), "Customer");

  // 4 · Disabled-account predicate.
  check("disabled true", isAccountDisabled({ disabled: true }));
  check("disabled false", !isAccountDisabled({ disabled: false }));
  check("disabled missing", !isAccountDisabled({}));
  check("disabled null profile", !isAccountDisabled(null));

  // 5 · canChangeRole: only super admins change roles.
  const base = {
    actorId: "actor-1",
    targetId: "target-1",
    targetCurrentRole: "customer",
    newRole: "admin",
    superAdminCount: 1,
  };
  eq(
    "guard: admin actor refused",
    canChangeRole({ ...base, actorRole: "admin" }).code,
    "FORBIDDEN_ROLE",
  );
  eq(
    "guard: ops actor refused",
    canChangeRole({ ...base, actorRole: "ops_manager" }).code,
    "FORBIDDEN_ROLE",
  );
  check(
    "guard: super promotes a customer",
    canChangeRole({ ...base, actorRole: "super_admin" }).ok,
  );
  check(
    "guard: super promotes to super_admin",
    canChangeRole({ ...base, actorRole: "super_admin", newRole: "super_admin" }).ok,
  );

  // 6 · canChangeRole: self-demotion is refused even for supers.
  eq(
    "guard: self demotion refused",
    canChangeRole({
      actorRole: "super_admin",
      actorId: "me",
      targetId: "me",
      targetCurrentRole: "super_admin",
      newRole: "admin",
      superAdminCount: 3,
    }).code,
    "SELF_DEMOTION",
  );

  // 7 · canChangeRole: the last super admin is protected; with a
  //     second super in place the same change is allowed.
  eq(
    "guard: last super protected",
    canChangeRole({
      actorRole: "super_admin",
      actorId: "me",
      targetId: "other",
      targetCurrentRole: "super_admin",
      newRole: "admin",
      superAdminCount: 1,
    }).code,
    "LAST_SUPER_ADMIN",
  );
  check(
    "guard: demote a super when another remains",
    canChangeRole({
      actorRole: "super_admin",
      actorId: "me",
      targetId: "other",
      targetCurrentRole: "super_admin",
      newRole: "admin",
      superAdminCount: 2,
    }).ok,
  );
  check(
    "guard: ordinary demotion unaffected",
    canChangeRole({
      actorRole: "super_admin",
      actorId: "me",
      targetId: "other",
      targetCurrentRole: "admin",
      newRole: "ops_manager",
      superAdminCount: 1,
    }).ok,
  );

  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length > 0) process.exit(1);
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
