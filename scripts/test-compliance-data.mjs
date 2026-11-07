/**
 * Compliance-data tests — plain node, no test framework. Compiles
 * src/lib/compliance-data.ts (a pure, import-free module) with the
 * project's own TypeScript into a scratch dir inside the project,
 * then asserts the dashboard's honesty invariants:
 *   1. every row carries one of the five canonical statuses,
 *   2. NO row is "Compliant" without a non-empty evidence string
 *      (the register rule: nothing is compliant without evidence),
 *   3. ids are unique,
 *   4. the clause rows 10.1–10.9 keep exactly the statuses assessed
 *      in ~/workspace/z-clean/compliance/01 (guards silent drift
 *      between the dashboard and the signed-off pack),
 *   5. shape: owners are Owner/Engineering/CA, expiry is null or a
 *      real YYYY-MM-DD, and no row ships with an empty requirement,
 *      applicability, missing or nextAction field.
 * Run: `npm run test:compliance-data`. Exits non-zero on failure.
 */
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtempSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const scratch = mkdtempSync(join(projectRoot, ".test-scratch-compliance-"));

try {
  const tscBin = join(projectRoot, "node_modules", ".bin", "tsc");
  execFileSync(
    tscBin,
    [
      "src/lib/compliance-data.ts",
      "--module", "commonjs",
      "--target", "es2022",
      "--lib", "es2022,dom",
      "--moduleResolution", "node",
      "--esModuleInterop",
      "--skipLibCheck",
      "--outDir", scratch,
    ],
    { cwd: projectRoot, stdio: "inherit" },
  );

  const require = createRequire(import.meta.url);
  const { COMPLIANCE_ROWS, COMPLIANCE_STATUSES, complianceStatusCounts } =
    require(join(scratch, "compliance-data.js"));

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

  const rows = COMPLIANCE_ROWS;
  const nonEmpty = (v) => typeof v === "string" && v.trim().length > 0;

  // 0. The data set is non-empty.
  check("rows exist", Array.isArray(rows) && rows.length > 0, `(got ${rows?.length})`);

  // 1. Every status is one of the canonical five.
  for (const row of rows) {
    check(
      `${row.id}: valid status`,
      COMPLIANCE_STATUSES.includes(row.status),
      `(got ${JSON.stringify(row.status)})`,
    );
  }

  // 2. "Compliant" requires evidence — the register's core rule.
  for (const row of rows) {
    if (row.status === "Compliant") {
      check(
        `${row.id}: Compliant has evidence`,
        nonEmpty(row.evidence),
        "(Compliant with an empty evidence string)",
      );
    }
  }
  check(
    "no Compliant row lacks evidence (summary)",
    rows.every((r) => r.status !== "Compliant" || nonEmpty(r.evidence)),
  );

  // 3. Ids are unique.
  const ids = rows.map((r) => r.id);
  check(
    "ids are unique",
    new Set(ids).size === ids.length,
    `(duplicates in ${JSON.stringify(ids)})`,
  );

  // 4. Clause statuses match compliance file 01 exactly.
  const EXPECTED_CLAUSE_STATUS = {
    "10.1": "Not Applicable",
    "10.2": "Not Applicable",
    "10.3": "Not Applicable",
    "10.4": "Partially Compliant",
    "10.5": "Partially Compliant",
    "10.6": "Pending Verification",
    "10.7": "Pending Verification",
    "10.8": "Non-Compliant",
    "10.9": "Not Applicable",
  };
  for (const [id, status] of Object.entries(EXPECTED_CLAUSE_STATUS)) {
    const row = rows.find((r) => r.id === id);
    check(
      `clause ${id} present with assessed status`,
      row !== undefined && row.status === status,
      `(got ${row ? JSON.stringify(row.status) : "missing"}, want ${JSON.stringify(status)})`,
    );
  }

  // 5. Row shape.
  const OWNERS = ["Owner", "Engineering", "CA"];
  for (const row of rows) {
    check(
      `${row.id}: shape complete`,
      nonEmpty(row.requirement) &&
        nonEmpty(row.applicability) &&
        nonEmpty(row.missing) &&
        nonEmpty(row.nextAction) &&
        OWNERS.includes(row.owner) &&
        (row.expiry === null || /^\d{4}-\d{2}-\d{2}$/.test(row.expiry)),
      `(owner=${JSON.stringify(row.owner)}, expiry=${JSON.stringify(row.expiry)})`,
    );
  }

  // 6. Summary counts cover every row exactly once.
  const counts = complianceStatusCounts();
  check(
    "summary counts sum to the row count",
    counts.reduce((n, c) => n + c.count, 0) === rows.length,
    `(sum ${counts.reduce((n, c) => n + c.count, 0)} vs ${rows.length} rows)`,
  );
  check(
    "summary lists every status",
    counts.length === COMPLIANCE_STATUSES.length,
  );

  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length > 0) {
    console.error(`Failing: ${failures.join("; ")}`);
    process.exit(1);
  }
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
