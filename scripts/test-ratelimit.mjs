/**
 * Rate-limit policy tests (P0 hardening) — plain node, no test
 * framework. Compiles src/lib/rate-limit.ts with the project's own
 * TypeScript into a scratch dir, then asserts the pure policy maths
 * the routes rely on: fixed-window flooring (windowStart) and the
 * allow/deny boundary (isAllowed), plus client-IP extraction.
 * The Postgres-backed checkRateLimit() is exercised live, not here.
 * Run: `npm run test:ratelimit`. Exits non-zero if any check fails.
 */
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const scratch = mkdtempSync(join(tmpdir(), "zclean-ratelimit-test-"));

try {
  const tscBin = join(projectRoot, "node_modules", ".bin", "tsc");
  execFileSync(
    tscBin,
    [
      "src/lib/rate-limit.ts",
      "--module", "commonjs",
      "--target", "es2022",
      "--moduleResolution", "node",
      "--skipLibCheck",
      "--outDir", scratch,
    ],
    { cwd: projectRoot, stdio: "inherit" },
  );

  const require = createRequire(import.meta.url);
  const { windowStart, isAllowed, getClientIp } = require(join(scratch, "rate-limit.js"));

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

  // 1 · windowStart floors to the window boundary (hourly windows).
  eq("hourly: exact boundary stays", windowStart(3_600_000, 3600), 3_600_000);
  eq("hourly: mid-window floors down", windowStart(3_600_000 + 1_234_567, 3600), 3_600_000);
  eq("hourly: last ms of window", windowStart(7_199_999, 3600), 3_600_000);
  eq("hourly: first ms of next window", windowStart(7_200_000, 3600), 7_200_000);
  eq("hourly: epoch zero", windowStart(0, 3600), 0);

  // 2 · Other window sizes floor the same way.
  eq("60s window: floors", windowStart(125_000, 60), 120_000);
  eq("60s window: boundary", windowStart(120_000, 60), 120_000);
  eq("15min window: floors", windowStart(1_000_000, 900), 900_000);

  // 3 · Consecutive timestamps in one window share a bucket; the next
  //     window gets a fresh one.
  {
    const base = 7_200_000; // aligned to an hourly boundary
    const a = windowStart(base + 1_000, 3600);
    const b = windowStart(base + 3_599_000, 3600);
    const c = windowStart(base + 3_600_000, 3600);
    eq("same window: same bucket", a, b);
    eq("same window: bucket is the boundary", a, base);
    check("next window: new bucket", c > a, `(expected ${c} > ${a})`);
  }

  // 4 · isAllowed: the limit-th hit passes, the next one is refused.
  eq("allowed: first hit", isAllowed(1, 10), true);
  eq("allowed: exactly at limit", isAllowed(10, 10), true);
  eq("denied: one over limit", isAllowed(11, 10), false);
  eq("denied: far over limit", isAllowed(250, 10), false);
  eq("allowed: limit of 1, first hit", isAllowed(1, 1), true);
  eq("denied: limit of 1, second hit", isAllowed(2, 1), false);

  // 5 · getClientIp: first x-forwarded-for entry wins; absent → shared
  //     "unknown" bucket (never undefined, never empty).
  {
    const req = (value) => ({
      headers: { get: (name) => (name === "x-forwarded-for" ? value : null) },
    });
    eq("ip: single value", getClientIp(req("203.0.113.7")), "203.0.113.7");
    eq("ip: first of chain", getClientIp(req("203.0.113.7, 10.0.0.1, 10.0.0.2")), "203.0.113.7");
    eq("ip: whitespace trimmed", getClientIp(req("  198.51.100.23 , 10.0.0.1")), "198.51.100.23");
    eq("ip: missing header", getClientIp(req(null)), "unknown");
    eq("ip: empty header", getClientIp(req("")), "unknown");
  }

  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length > 0) {
    console.error(`Failing: ${failures.join("; ")}`);
    process.exit(1);
  }
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
