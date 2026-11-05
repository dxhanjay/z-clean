/**
 * Admin notification derivation tests (Delta 1) — plain node, no test
 * framework. Compiles src/lib/notifications.ts with the project's own
 * TypeScript into a scratch dir, then asserts every derivation rule
 * (refund pending/stuck, per-status stuck thresholds, failed
 * payments, guest pickups, voucher expiry window, missing closing),
 * the severity-then-recency sort, and the 50-item cap.
 * Run: `npm run test:notifications`. Exits non-zero on any failure.
 */
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const scratch = mkdtempSync(join(tmpdir(), "zclean-notifications-test-"));

try {
  const tscBin = join(projectRoot, "node_modules", ".bin", "tsc");
  execFileSync(
    tscBin,
    [
      "src/lib/notifications.ts",
      "--module", "commonjs",
      "--target", "es2022",
      "--moduleResolution", "node",
      "--skipLibCheck",
      "--outDir", scratch,
    ],
    { cwd: projectRoot, stdio: "inherit" },
  );

  const require = createRequire(import.meta.url);
  const { buildNotifications, notificationCounts } = require(
    join(scratch, "notifications.js"),
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

  // Fixed "now": 2026-11-05 12:00 UTC (17:30 IST).
  const now = new Date("2026-11-05T12:00:00.000Z");
  const hoursAgo = (h) => new Date(now.getTime() - h * 3_600_000).toISOString();

  const emptyInput = {
    refunds: [],
    orders: [],
    guestPickups: [],
    vouchers: [],
    yesterday: { date: "2026-11-04", hasCashActivity: false, hasClosing: true },
    now,
  };
  const build = (patch) => buildNotifications({ ...emptyInput, ...patch }, now);
  const kinds = (items) => items.map((i) => i.kind);

  // 1 · Nothing in, nothing out — and no closing nag without activity.
  eq("empty input → no items", build({}).length, 0);
  eq(
    "closing present → no nag",
    build({ yesterday: { date: "2026-11-04", hasCashActivity: true, hasClosing: true } }).length,
    0,
  );

  // 2 · Refunds: requested → pending (medium); approved >24h →
  //     stuck (high); approved recently or rejected/processed → none.
  const refundItems = build({
    refunds: [
      { id: "r1", orderId: "o1", amountPaise: 5000, status: "requested", createdAt: hoursAgo(2), decidedAt: null },
      { id: "r2", orderId: "o2", amountPaise: 7000, status: "approved", createdAt: hoursAgo(50), decidedAt: hoursAgo(30) },
      { id: "r3", orderId: "o3", amountPaise: 7000, status: "approved", createdAt: hoursAgo(10), decidedAt: hoursAgo(3) },
      { id: "r4", orderId: "o4", amountPaise: 7000, status: "processed", createdAt: hoursAgo(90), decidedAt: hoursAgo(80) },
    ],
  });
  eq("refunds: two items", refundItems.length, 2);
  check("refunds: kinds", kinds(refundItems).includes("refund_pending") && kinds(refundItems).includes("refund_stuck"));
  eq("refunds: stuck sorts first (high)", refundItems[0].kind, "refund_stuck");
  eq("refunds: stuck severity", refundItems[0].severity, "high");
  eq("refunds: pending severity", refundItems.find((i) => i.kind === "refund_pending").severity, "medium");

  // 3 · Order stuck thresholds per status.
  const order = (status, h, extra = {}) => ({
    id: `ord-${status}-${h}`,
    status,
    paymentStatus: "cod_pending",
    createdAt: hoursAgo(h),
    ...extra,
  });
  eq("PLACED 25h → stuck", build({ orders: [order("PLACED", 25)] }).length, 1);
  eq("PLACED 23h → not yet", build({ orders: [order("PLACED", 23)] }).length, 0);
  eq("PICKUP_SCHEDULED 25h → stuck", build({ orders: [order("PICKUP_SCHEDULED", 25)] }).length, 1);
  eq("IN_PROCESS 71h → not yet", build({ orders: [order("IN_PROCESS", 71)] }).length, 0);
  const inProcess = build({ orders: [order("IN_PROCESS", 73)] });
  eq("IN_PROCESS 73h → stuck high", inProcess[0]?.severity, "high");
  eq("READY 49h → stuck", build({ orders: [order("READY", 49)] }).length, 1);
  eq("READY 47h → not yet", build({ orders: [order("READY", 47)] }).length, 0);
  eq("OUT_FOR_DELIVERY never stuck", build({ orders: [order("OUT_FOR_DELIVERY", 500)] }).length, 0);
  eq("DELIVERED never stuck", build({ orders: [order("DELIVERED", 500)] }).length, 0);

  // 4 · Failed payments: live orders only.
  const failed = build({ orders: [order("PICKUP_SCHEDULED", 1, { paymentStatus: "failed" })] });
  eq("failed payment on live order", failed.length, 1);
  eq("failed payment kind", failed[0].kind, "payment_failed");
  eq(
    "failed payment on delivered order ignored",
    build({ orders: [order("DELIVERED", 1, { paymentStatus: "failed" })] }).length,
    0,
  );

  // 5 · Guest pickups: only when older than 24h.
  eq(
    "guest pickup 25h → item",
    build({ guestPickups: [{ id: "p1", name: "Asha", phone: "9999999999", createdAt: hoursAgo(25) }] }).length,
    1,
  );
  eq(
    "guest pickup 2h → none",
    build({ guestPickups: [{ id: "p1", name: "Asha", phone: "9999999999", createdAt: hoursAgo(2) }] }).length,
    0,
  );

  // 6 · Vouchers: active + expiry within 7 IST days (today is 11-05).
  const voucher = (validUntil, status = "issued") => ({
    id: `v-${validUntil}-${status}`,
    code: "GIFT-TEST",
    kind: "promo",
    status,
    validUntil,
    balancePaise: null,
  });
  eq("voucher expiring today", build({ vouchers: [voucher("2026-11-05")] }).length, 1);
  eq("voucher expiring in 7d", build({ vouchers: [voucher("2026-11-12")] }).length, 1);
  eq("voucher expiring in 8d → none", build({ vouchers: [voucher("2026-11-13")] }).length, 0);
  eq("voucher already expired → none", build({ vouchers: [voucher("2026-11-04")] }).length, 0);
  eq("redeemed voucher → none", build({ vouchers: [voucher("2026-11-06", "redeemed")] }).length, 0);
  eq("open-ended voucher → none", build({ vouchers: [voucher(null)] }).length, 0);

  // 7 · Missing closing fires only with cash activity and no closing.
  const closing = build({
    yesterday: { date: "2026-11-04", hasCashActivity: true, hasClosing: false },
  });
  eq("missing closing fires", closing.length, 1);
  eq("missing closing kind", closing[0].kind, "closing_missing");
  eq(
    "no cash activity → no nag",
    build({ yesterday: { date: "2026-11-04", hasCashActivity: false, hasClosing: false } }).length,
    0,
  );

  // 8 · Sort: severity first (high, medium, low), recency inside.
  const mixed = build({
    guestPickups: [{ id: "p1", name: "Asha", phone: "9", createdAt: hoursAgo(30) }],
    refunds: [
      { id: "r1", orderId: "o1", amountPaise: 100, status: "requested", createdAt: hoursAgo(1), decidedAt: null },
    ],
    orders: [order("IN_PROCESS", 100)],
  });
  eq("sort: high first", mixed[0].severity, "high");
  eq("sort: medium second", mixed[1].severity, "medium");
  eq("sort: low last", mixed[2].severity, "low");

  // 9 · Cap at 50 and counts helper.
  const many = build({
    orders: Array.from({ length: 80 }, (_, i) => ({
      id: `bulk-${i}`,
      status: "PLACED",
      paymentStatus: "cod_pending",
      createdAt: hoursAgo(100),
    })),
  });
  eq("cap: 50 items max", many.length, 50);
  const counts = notificationCounts(mixed);
  eq("counts: total", counts.total, 3);
  eq("counts: high", counts.high, 1);

  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length > 0) process.exit(1);
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
