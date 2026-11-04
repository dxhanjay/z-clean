/**
 * Organisation tests (Phase 7a) — plain node, no test framework.
 *
 * Compiles src/lib/org.ts with the project's own TypeScript into a
 * scratch dir (CommonJS), then asserts the staff permission matrix,
 * the employee/branch form validators and the employee-code
 * generator. Run: `npm run test:org`.
 * Exits non-zero on the first failing batch (all failures are printed).
 */
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const scratch = mkdtempSync(join(tmpdir(), "zclean-org-test-"));

try {
  const tscBin = join(projectRoot, "node_modules", ".bin", "tsc");
  execFileSync(
    tscBin,
    [
      "src/lib/org.ts",
      "--module", "commonjs",
      "--target", "es2020",
      "--moduleResolution", "node",
      "--skipLibCheck",
      "--outDir", scratch,
    ],
    { cwd: projectRoot, stdio: "inherit" },
  );

  const require = createRequire(import.meta.url);
  const org = require(join(scratch, "org.js"));
  const {
    STAFF_ROLES,
    STAFF_ROLE_IDS,
    BRANCH_TYPES,
    validateEmployeeForm,
    validateBranchForm,
    employeeCodeForSequence,
    suggestNextEmployeeCode,
    DEMO_BRANCHES,
    DEMO_EMPLOYEES,
  } = org;

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

  // 1 · Permission matrix integrity: exactly the 12 plan roles.
  const EXPECTED_ROLES = [
    "collection_center",
    "picker",
    "transporter_inbound",
    "plant_manager",
    "washerman",
    "ironing_staff",
    "quality_checker",
    "packer",
    "transporter_outbound",
    "delivery_staff",
    "cashier",
    "branch_manager",
  ];
  eq("roles: exactly 12", STAFF_ROLES.length, 12);
  check(
    "roles: ids match the plan",
    JSON.stringify([...STAFF_ROLE_IDS].sort()) === JSON.stringify([...EXPECTED_ROLES].sort()),
  );
  eq("roles: ids unique", new Set(STAFF_ROLE_IDS).size, 12);
  check(
    "roles: every role has label + stage + at least one action",
    STAFF_ROLES.every(
      (r) =>
        typeof r.label === "string" &&
        r.label.length > 0 &&
        typeof r.stage === "string" &&
        r.stage.length > 0 &&
        Array.isArray(r.actions) &&
        r.actions.length >= 1 &&
        r.actions.every((a) => typeof a === "string" && a.length > 0),
    ),
  );
  eq("roles: branch types", BRANCH_TYPES.map((t) => t.value).join(","), "plant,collection_center,branch");

  // 2 · Employee form validation.
  const valid = validateEmployeeForm({
    fullName: "Ramesh Kumar",
    phone: "9876543210",
    roles: ["picker"],
  });
  eq("employee valid: ok", valid.ok, true);
  eq("employee valid: no errors", Object.keys(valid.errors).length, 0);

  const withCountryCode = validateEmployeeForm({
    fullName: "Ramesh Kumar",
    phone: "+91 9876543210",
    email: "ramesh@example.com",
    employeeCode: "ZC-EMP-0010",
    roles: ["washerman", "quality_checker"],
    joiningDate: "2026-11-01",
    employmentStatus: "active",
  });
  eq("employee valid (+91, multi-role): ok", withCountryCode.ok, true);

  const badPhone = validateEmployeeForm({
    fullName: "Ramesh Kumar",
    phone: "12345",
    roles: ["picker"],
  });
  eq("employee bad phone: rejected", badPhone.ok, false);
  check("employee bad phone: phone error", typeof badPhone.errors.phone === "string");

  const badPhoneStart = validateEmployeeForm({
    fullName: "Ramesh Kumar",
    phone: "1234567890",
    roles: ["picker"],
  });
  eq("employee phone starting with 1: rejected", badPhoneStart.ok, false);

  const missingName = validateEmployeeForm({ phone: "9876543210", roles: ["picker"] });
  eq("employee missing name: rejected", missingName.ok, false);
  check("employee missing name: name error", typeof missingName.errors.fullName === "string");

  const noRoles = validateEmployeeForm({
    fullName: "Ramesh Kumar",
    phone: "9876543210",
    roles: [],
  });
  eq("employee no roles: rejected", noRoles.ok, false);
  check("employee no roles: roles error", typeof noRoles.errors.roles === "string");

  const badRole = validateEmployeeForm({
    fullName: "Ramesh Kumar",
    phone: "9876543210",
    roles: ["super_admin"],
  });
  eq("employee unknown role: rejected", badRole.ok, false);

  const badEmail = validateEmployeeForm({
    fullName: "Ramesh Kumar",
    phone: "9876543210",
    email: "not-an-email",
    roles: ["picker"],
  });
  eq("employee bad email: rejected", badEmail.ok, false);

  const badDate = validateEmployeeForm({
    fullName: "Ramesh Kumar",
    phone: "9876543210",
    roles: ["picker"],
    joiningDate: "01/11/2026",
  });
  eq("employee bad joining date: rejected", badDate.ok, false);

  // 3 · Branch form validation.
  eq(
    "branch valid: ok",
    validateBranchForm({ name: "Sector 4 Collection Center", type: "collection_center", pincode: "827004" }).ok,
    true,
  );
  eq(
    "branch bad type: rejected",
    validateBranchForm({ name: "Somewhere", type: "warehouse" }).ok,
    false,
  );
  eq(
    "branch bad pincode: rejected",
    validateBranchForm({ name: "Somewhere", type: "branch", pincode: "8270" }).ok,
    false,
  );
  eq(
    "branch missing name: rejected",
    validateBranchForm({ type: "plant" }).ok,
    false,
  );

  // 4 · Employee code generator.
  eq("code: sequence 1", employeeCodeForSequence(1), "ZC-EMP-0001");
  eq("code: sequence 42", employeeCodeForSequence(42), "ZC-EMP-0042");
  eq("code: sequence 1234", employeeCodeForSequence(1234), "ZC-EMP-1234");
  check(
    "code: format ZC-EMP-nnnn",
    /^ZC-EMP-\d{4}$/.test(employeeCodeForSequence(7)),
  );
  eq("code: next with none in use", suggestNextEmployeeCode([]), "ZC-EMP-0001");
  eq(
    "code: next after 1 and 3",
    suggestNextEmployeeCode(["ZC-EMP-0001", "ZC-EMP-0003"]),
    "ZC-EMP-0004",
  );
  eq(
    "code: next ignores foreign codes",
    suggestNextEmployeeCode(["ZC-EMP-0002", "TEMP-9"]),
    "ZC-EMP-0003",
  );
  {
    const generated = new Set();
    for (let n = 1; n <= 50; n += 1) generated.add(employeeCodeForSequence(n));
    eq("code: 50 generated codes are unique", generated.size, 50);
  }

  // 5 · Demo seed sanity: 2 units, 3 staff, roles all valid, one
  //     multi-role employee (the pattern the plan requires).
  eq("demo: 2 branches", DEMO_BRANCHES.length, 2);
  check(
    "demo: one plant + one collection center",
    DEMO_BRANCHES.some((b) => b.type === "plant") &&
      DEMO_BRANCHES.some((b) => b.type === "collection_center"),
  );
  eq("demo: 3 employees", DEMO_EMPLOYEES.length, 3);
  check(
    "demo: all roles valid",
    DEMO_EMPLOYEES.every((e) => e.roles.every((r) => STAFF_ROLE_IDS.includes(r))),
  );
  check(
    "demo: at least one multi-role employee",
    DEMO_EMPLOYEES.some((e) => e.roles.length >= 2),
  );
  check(
    "demo: employee codes unique",
    new Set(DEMO_EMPLOYEES.map((e) => e.employeeCode)).size === DEMO_EMPLOYEES.length,
  );

  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length > 0) {
    console.error(`Failing: ${failures.join("; ")}`);
    process.exit(1);
  }
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
