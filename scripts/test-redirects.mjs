/**
 * Redirect tests — plain node, no test framework. Compiles
 * src/lib/redirects.ts (a pure, import-free module) with the
 * project's own TypeScript into a scratch dir inside the project,
 * then asserts the post-login ?next= rule:
 *   1. a safe local path is honoured as-is (the staff shell's
 *      /login?next=/staff round-trip),
 *   2. anything missing, empty or not a local path falls back,
 *   3. open-redirect shapes ("//host", absolute URLs, backslash
 *      tricks) can never be honoured.
 * Run: `npm run test:redirects`. Exits non-zero on failure.
 */
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtempSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const scratch = mkdtempSync(join(projectRoot, ".test-scratch-redirects-"));

try {
  const tscBin = join(projectRoot, "node_modules", ".bin", "tsc");
  execFileSync(
    tscBin,
    [
      "src/lib/redirects.ts",
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
  const { safeNextPath } = require(join(scratch, "redirects.js"));

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
    check(
      name,
      JSON.stringify(actual) === JSON.stringify(expected),
      `(got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)})`,
    );
  }

  const DASH = "/dashboard";

  // 1. Safe local paths are honoured exactly.
  eq("staff target honoured", safeNextPath("/staff", DASH), "/staff");
  eq(
    "deep local path with query honoured",
    safeNextPath("/staff/tasks/abc?from=list", DASH),
    "/staff/tasks/abc?from=list",
  );
  eq("root path honoured", safeNextPath("/", DASH), "/");
  eq(
    "dashboard itself honoured",
    safeNextPath("/dashboard", DASH),
    "/dashboard",
  );
  eq(
    "surrounding whitespace trimmed",
    safeNextPath("  /staff  ", DASH),
    "/staff",
  );

  // 2. Missing / empty / non-path input falls back.
  eq("null falls back", safeNextPath(null, DASH), DASH);
  eq("undefined falls back", safeNextPath(undefined, DASH), DASH);
  eq("empty string falls back", safeNextPath("", DASH), DASH);
  eq("whitespace only falls back", safeNextPath("   ", DASH), DASH);
  eq("bare word falls back", safeNextPath("staff", DASH), DASH);

  // 3. Open-redirect shapes are never honoured.
  eq(
    "protocol-relative URL falls back",
    safeNextPath("//evil.example", DASH),
    DASH,
  );
  eq("triple slash falls back", safeNextPath("///evil.example", DASH), DASH);
  eq(
    "absolute URL falls back",
    safeNextPath("https://evil.example/staff", DASH),
    DASH,
  );
  eq(
    "backslash trick falls back",
    safeNextPath("/\\evil.example", DASH),
    DASH,
  );

  // The fallback is the caller's, not a hardcoded one.
  eq(
    "custom fallback respected",
    safeNextPath("//evil.example", "/account"),
    "/account",
  );
  eq(
    "custom fallback unused for safe path",
    safeNextPath("/orders", "/account"),
    "/orders",
  );

  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length > 0) {
    console.error(`Failing: ${failures.join("; ")}`);
    process.exit(1);
  }
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
