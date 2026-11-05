/**
 * Dashboard analytics tests (Delta 1) — plain node, no test framework.
 * Compiles src/lib/analytics.ts (which imports the pure order-flow
 * status list) with the project's own TypeScript into a scratch dir,
 * then asserts IST day bucketing (including the UTC/IST date split),
 * zero-day filling, revenue summing rules, and the status breakdown.
 * Run: `npm run test:analytics`. Exits non-zero if any check fails.
 */
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const scratch = mkdtempSync(join(tmpdir(), "zclean-analytics-test-"));

try {
  const tscBin = join(projectRoot, "node_modules", ".bin", "tsc");
  execFileSync(
    tscBin,
    [
      "src/lib/analytics.ts",
      "--module", "commonjs",
      "--target", "es2022",
      "--moduleResolution", "node",
      "--skipLibCheck",
      "--outDir", scratch,
    ],
    { cwd: projectRoot, stdio: "inherit" },
  );

  const require = createRequire(import.meta.url);
  const { bucketDailySeries, statusBreakdown, istDateOf } = require(
    join(scratch, "analytics.js"),
  );

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
      actual === expected,
      `(expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`,
    );
  }

  // Fixed "now": 2026-11-05 12:00 UTC = 17:30 IST on 2026-11-05.
  const now = new Date("2026-11-05T12:00:00.000Z");

  // 1 · IST date conversion: 19:00 UTC is already the NEXT IST day.
  eq("istDateOf: morning UTC stays", istDateOf("2026-11-05T10:00:00.000Z"), "2026-11-05");
  eq("istDateOf: evening UTC rolls over", istDateOf("2026-11-05T19:00:00.000Z"), "2026-11-06");
  eq("istDateOf: just before IST midnight", istDateOf("2026-11-05T18:29:59.000Z"), "2026-11-05");
  eq("istDateOf: exactly IST midnight", istDateOf("2026-11-05T18:30:00.000Z"), "2026-11-06");

  // 2 · The window is `days` long, ends today IST, zero-filled.
  const empty = bucketDailySeries({ orders: [], revenue: [] }, 7, now);
  eq("window length", empty.length, 7);
  eq("window ends today IST", empty[6].date, "2026-11-05");
  eq("window starts 6 days back", empty[0].date, "2026-10-30");
  check("empty window is honest zeros", empty.every((d) => d.orders === 0 && d.revenuePaise === 0));

  // 3 · Orders and revenue land in their IST buckets.
  const series = bucketDailySeries(
    {
      orders: [
        { createdAt: "2026-11-05T05:00:00.000Z" }, // IST 11-05
        { createdAt: "2026-11-05T19:00:00.000Z" }, // IST 11-06 — outside
        { createdAt: "2026-11-04T20:00:00.000Z" }, // IST 11-05 01:30
        { createdAt: "2026-10-30T00:00:00.000Z" }, // IST 10-30
        { createdAt: "2026-10-29T10:00:00.000Z" }, // IST 10-29 — outside
      ],
      revenue: [
        { createdAt: "2026-11-05T05:00:00.000Z", amountPaise: 10_000 },
        { createdAt: "2026-11-05T06:00:00.000Z", amountPaise: 2_500 },
        { createdAt: "2026-11-04T20:00:00.000Z", amountPaise: 700 },
        { createdAt: "2026-11-05T06:30:00.000Z", amountPaise: -50 }, // refunds never subtract here
        { createdAt: "2026-11-03T06:00:00.000Z", amountPaise: 999 },
      ],
    },
    7,
    now,
  );
  const byDate = new Map(series.map((d) => [d.date, d]));
  eq("today: orders", byDate.get("2026-11-05").orders, 2);
  eq("today: revenue sums payments only", byDate.get("2026-11-05").revenuePaise, 13_200);
  eq("first day: orders", byDate.get("2026-10-30").orders, 1);
  eq("mid day: revenue", byDate.get("2026-11-03").revenuePaise, 999);
  eq(
    "outside rows ignored",
    series.reduce((s, d) => s + d.orders, 0),
    3,
  );

  // 4 · days=1 is just today; large windows stay exact.
  eq("days=1 length", bucketDailySeries({ orders: [], revenue: [] }, 1, now).length, 1);
  eq("days=30 length", bucketDailySeries({ orders: [], revenue: [] }, 30, now).length, 30);

  // 5 · Status breakdown: known statuses in lifecycle order with
  //     zeros; counts land; unknown statuses appended.
  const breakdown = statusBreakdown([
    { status: "PLACED" },
    { status: "PLACED" },
    { status: "DELIVERED" },
    { status: "IN_PROCESS" },
    { status: "SOMETHING_ELSE" },
  ]);
  eq("breakdown: PLACED first", breakdown[0].status, "PLACED");
  eq("breakdown: PLACED count", breakdown[0].count, 2);
  eq(
    "breakdown: DELIVERED count",
    breakdown.find((b) => b.status === "DELIVERED").count,
    1,
  );
  eq(
    "breakdown: READY zero present",
    breakdown.find((b) => b.status === "READY").count,
    0,
  );
  eq("breakdown: unknown appended last", breakdown[breakdown.length - 1].status, "SOMETHING_ELSE");
  eq(
    "breakdown: total preserved",
    breakdown.reduce((s, b) => s + b.count, 0),
    5,
  );
  eq("breakdown: empty input still lists statuses", statusBreakdown([]).length, 12);

  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length > 0) process.exit(1);
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
