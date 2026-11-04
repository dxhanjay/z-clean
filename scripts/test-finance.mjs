/**
 * Finance tests (Phase 9) — plain node, no test framework.
 *
 * Compiles the pure money module (src/lib/finance.ts), the reports
 * aggregation (src/lib/reports.ts) and the request schemas
 * (src/lib/validation.ts) with the project's own TypeScript into a
 * scratch dir INSIDE the project, then asserts:
 *   1. the paid-total rule (gateway rows + ledger entries),
 *   2. the voucher NO-double-count rule,
 *   3. the legacy-settled rule,
 *   4. outstanding / refundable math (incl. pending-refund holds),
 *   5. payment-status decisions,
 *   6. daily cash expectation + IST day boundaries,
 *   7. aging buckets,
 *   8. collections by method,
 *   9. reports aggregation smoke checks,
 *  10. the zod request schemas.
 * Run: `npm run test:finance`. Exits non-zero on failure.
 */
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtempSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const scratch = mkdtempSync(join(projectRoot, ".test-scratch-finance-"));

try {
  const tscBin = join(projectRoot, "node_modules", ".bin", "tsc");
  execFileSync(
    tscBin,
    [
      "src/lib/finance.ts",
      "src/lib/reports.ts",
      "src/lib/validation.ts",
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
  const finance = require(join(scratch, "finance.js"));
  const reports = require(join(scratch, "reports.js"));
  const validation = require(join(scratch, "validation.js"));
  const {
    computeOrderFinance,
    decidePaymentStatus,
    expectedCashPaise,
    istDayRangeUtc,
    istToday,
    isInIstDay,
    agingBucket,
    collectionsByMethod,
    formatMoneyPaise,
  } = finance;
  const { buildReports } = reports;
  const {
    recordPaymentSchema,
    refundRequestSchema,
    refundActionSchema,
    expenseCreateSchema,
    closeDaySchema,
  } = validation;

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

  const order = (totalPaise, paymentStatus) => ({ totalPaise, paymentStatus });
  const gw = (amountPaise, status = "paid", gateway = "razorpay") => ({ amountPaise, status, gateway });
  const entry = (entryType, method, amountPaise) => ({ entryType, method, amountPaise });
  const refund = (amountPaise, status) => ({ amountPaise, status });

  /* ---------------------------------------------------------------- */
  /* 1–2 · Paid-total rule + voucher no-double-count                   */
  /* ---------------------------------------------------------------- */
  eq("paid: razorpay paid row counts", computeOrderFinance(order(10000, "pending"), [gw(10000)], [], []).effectivePaidPaise, 10000);
  eq("paid: created row ignored", computeOrderFinance(order(10000, "pending"), [gw(10000, "created")], [], []).effectivePaidPaise, 0);
  eq("paid: failed row ignored", computeOrderFinance(order(10000, "failed"), [gw(10000, "failed")], [], []).effectivePaidPaise, 0);
  // A gift-card redemption is ONE payments row (gateway 'voucher').
  // orders.voucher_redeemed_paise mirrors it and is never an input —
  // the card's money must appear exactly once.
  eq("paid: voucher row counted once", computeOrderFinance(order(10000, "cod_pending"), [gw(5000, "paid", "voucher")], [], []).effectivePaidPaise, 5000);
  eq("paid: gateway + entries add", computeOrderFinance(order(10000, "cod_pending"), [gw(5000, "paid", "voucher")], [entry("payment", "cash", 3000)], []).effectivePaidPaise, 8000);
  eq("paid: refund entries are not payments", computeOrderFinance(order(10000, "paid"), [gw(10000)], [entry("refund", "cash", 2000)], []).effectivePaidPaise, 10000);

  /* ---------------------------------------------------------------- */
  /* 3 · Legacy-settled rule                                           */
  /* ---------------------------------------------------------------- */
  {
    const f = computeOrderFinance(order(10000, "paid"), [], [], []);
    eq("legacy: paid with no rows settles in full", f.effectivePaidPaise, 10000);
    eq("legacy: flag set", f.legacySettled, true);
    eq("legacy: nothing outstanding", f.outstandingPaise, 0);
  }
  {
    const f = computeOrderFinance(order(10000, "paid"), [gw(4000)], [], []);
    eq("legacy: partial ledger still settles", f.effectivePaidPaise, 10000);
    eq("legacy: partial ledger flag set", f.legacySettled, true);
  }
  {
    const f = computeOrderFinance(order(10000, "cod_pending"), [], [], []);
    eq("legacy: cod_pending does not settle", f.effectivePaidPaise, 0);
    eq("legacy: cod_pending flag clear", f.legacySettled, false);
  }
  {
    const f = computeOrderFinance(order(10000, "paid"), [gw(10000)], [], []);
    eq("legacy: fully ledgered paid is not legacy", f.legacySettled, false);
    eq("legacy: fully ledgered paid total", f.effectivePaidPaise, 10000);
  }

  /* ---------------------------------------------------------------- */
  /* 4 · Outstanding + refundable                                      */
  /* ---------------------------------------------------------------- */
  eq("outstanding: partial", computeOrderFinance(order(10000, "cod_pending"), [], [entry("payment", "upi", 4000)], []).outstandingPaise, 6000);
  eq("outstanding: refunds never reopen the bill", computeOrderFinance(order(10000, "paid"), [gw(10000)], [entry("refund", "cash", 5000)], []).outstandingPaise, 0);
  {
    const f = computeOrderFinance(
      order(10000, "paid"),
      [gw(10000)],
      [entry("refund", "cash", 2000)],
      [refund(3000, "requested"), refund(1000, "approved"), refund(500, "rejected"), refund(2000, "processed")],
    );
    eq("refundable: processed counted once via entries", f.refundsProcessedPaise, 2000);
    eq("refundable: requested + approved hold", f.refundsPendingPaise, 4000);
    eq("refundable: rejected releases, processed status row ignored", f.refundablePaise, 4000);
  }
  eq("refundable: clamps at zero", computeOrderFinance(order(5000, "paid"), [gw(5000)], [], [refund(9000, "requested")]).refundablePaise, 0);
  eq("refundable: legacy order refunds against full total", computeOrderFinance(order(7000, "paid"), [], [], []).refundablePaise, 7000);

  /* ---------------------------------------------------------------- */
  /* 5 · Status decisions                                              */
  /* ---------------------------------------------------------------- */
  eq("decide: settled → paid", decidePaymentStatus(computeOrderFinance(order(10000, "cod_pending"), [], [entry("payment", "cash", 10000)], [])), "paid");
  eq("decide: part → partially_paid", decidePaymentStatus(computeOrderFinance(order(10000, "cod_pending"), [], [entry("payment", "cash", 100)], [])), "partially_paid");
  eq("decide: nothing → keep (null)", decidePaymentStatus(computeOrderFinance(order(10000, "cod_pending"), [], [], [])), null);
  eq("decide: fully refunded → refunded", decidePaymentStatus(computeOrderFinance(order(10000, "paid"), [gw(10000)], [entry("refund", "upi", 10000)], [])), "refunded");
  eq("decide: partly refunded stays paid", decidePaymentStatus(computeOrderFinance(order(10000, "paid"), [gw(10000)], [entry("refund", "upi", 3000)], [])), "paid");
  eq("decide: refunded wins over outstanding", decidePaymentStatus(computeOrderFinance(order(10000, "cod_pending"), [gw(6000)], [entry("refund", "cash", 6000)], [])), "refunded");

  /* ---------------------------------------------------------------- */
  /* 6 · Cash expectation + IST days                                   */
  /* ---------------------------------------------------------------- */
  eq(
    "cash: payments − refunds, cash only",
    expectedCashPaise([
      entry("payment", "cash", 5000),
      entry("refund", "cash", 1000),
      entry("payment", "upi", 9000),
      entry("refund", "upi", 500),
    ]),
    4000,
  );
  {
    const range = istDayRangeUtc("2026-11-04");
    eq("ist: day starts 18:30Z previous day", range.startUtc, "2026-11-03T18:30:00.000Z");
    eq("ist: day ends 18:30Z", range.endUtc, "2026-11-04T18:30:00.000Z");
    check("ist: boundary start included", isInIstDay("2026-11-03T18:30:00.000Z", "2026-11-04"));
    check("ist: last second included", isInIstDay("2026-11-04T18:29:59.000Z", "2026-11-04"));
    check("ist: boundary end excluded", !isInIstDay("2026-11-04T18:30:00.000Z", "2026-11-04"));
    check("ist: UTC morning is same IST day", isInIstDay("2026-11-04T02:00:00.000Z", "2026-11-04"));
  }
  eq("ist: today rolls at 18:30Z", istToday(new Date("2026-11-04T19:00:00.000Z")), "2026-11-05");
  eq("ist: today before roll", istToday(new Date("2026-11-04T10:00:00.000Z")), "2026-11-04");

  /* ---------------------------------------------------------------- */
  /* 7 · Aging buckets                                                 */
  /* ---------------------------------------------------------------- */
  {
    const now = new Date("2026-11-10T12:00:00.000Z");
    const at = (daysAgo) => new Date(now.getTime() - daysAgo * 86_400_000).toISOString();
    eq("aging: same day", agingBucket(at(0), now), "0–1 days");
    eq("aging: 1 day", agingBucket(at(1), now), "0–1 days");
    eq("aging: 2 days", agingBucket(at(2), now), "2–3 days");
    eq("aging: 3 days", agingBucket(at(3), now), "2–3 days");
    eq("aging: 5 days", agingBucket(at(5), now), "4–7 days");
    eq("aging: 7 days", agingBucket(at(7), now), "4–7 days");
    eq("aging: 9 days", agingBucket(at(9), now), "Over 7 days");
  }

  /* ---------------------------------------------------------------- */
  /* 8 · Collections by method + formatting                            */
  /* ---------------------------------------------------------------- */
  {
    const rows = collectionsByMethod(
      [gw(2000, "paid", "razorpay"), gw(1500, "paid", "voucher"), gw(999, "created", "razorpay")],
      [entry("payment", "cash", 3000), entry("payment", "upi", 1000), entry("refund", "cash", 500)],
    );
    const byMethod = Object.fromEntries(rows.map((r) => [r.method, r]));
    eq("collections: cash from entries only", byMethod.cash.entriesPaise, 3000);
    eq("collections: razorpay from gateway only", byMethod.razorpay.gatewayPaise, 2000);
    eq("collections: voucher gateway", byMethod.voucher.totalPaise, 1500);
    eq("collections: refunds excluded", rows.reduce((s, r) => s + r.totalPaise, 0), 7500);
  }
  eq("format: whole rupees", formatMoneyPaise(29000), "₹290");
  eq("format: paise shown", formatMoneyPaise(150050), "₹1,500.50");
  eq("format: Indian grouping", formatMoneyPaise(123456789), "₹12,34,567.89");

  /* ---------------------------------------------------------------- */
  /* 9 · Reports aggregation                                           */
  /* ---------------------------------------------------------------- */
  {
    const now = new Date("2026-11-10T12:00:00.000Z");
    const mkOrder = (id, createdAt, status, totalPaise, collectedPaise, area, customerKey, items) => ({
      id, createdAt, status, totalPaise, collectedPaise, area,
      customerKey, customerLabel: customerKey, items,
    });
    const result = buildReports({
      periodOrders: [
        mkOrder("o1", "2026-11-09T05:00:00.000Z", "DELIVERED", 10000, 10000, "Sector 4", "cust-a", [
          { serviceSlug: "dry-cleaning", serviceTitle: "Dry Cleaning", lineTotalPaise: 10000 },
        ]),
        mkOrder("o2", "2026-11-09T06:00:00.000Z", "IN_PROCESS", 5000, 2000, "Sector 4", "cust-a", [
          { serviceSlug: "laundry", serviceTitle: "Laundry", lineTotalPaise: 5000 },
        ]),
        mkOrder("o3", "2026-11-08T06:00:00.000Z", "CANCELLED", 99900, 0, "Chas", "cust-b", []),
      ],
      openOrders: [
        mkOrder("o2", "2026-11-09T06:00:00.000Z", "IN_PROCESS", 5000, 2000, "Sector 4", "cust-a", []),
        mkOrder("o4", "2026-11-01T06:00:00.000Z", "PLACED", 3000, 0, "Chas", "cust-c", []),
      ],
      allOrders: [
        mkOrder("o1", "2026-11-09T05:00:00.000Z", "DELIVERED", 10000, 10000, "Sector 4", "cust-a", []),
        mkOrder("o2", "2026-11-09T06:00:00.000Z", "IN_PROCESS", 5000, 2000, "Sector 4", "cust-a", []),
        mkOrder("o5", "2026-10-01T06:00:00.000Z", "DELIVERED", 7000, 7000, "Chas", "cust-b", []),
      ],
      handovers: [
        { orderId: "o1", pointId: "centre_to_plant", toEmployeeId: "emp-1", flags: [] },
        { orderId: "o1", pointId: "delivery", toEmployeeId: "emp-2", flags: ["quantity_mismatch"] },
        { orderId: "o2", pointId: "pickup", toEmployeeId: "emp-2", flags: [] },
      ],
      employees: [
        { id: "emp-1", fullName: "Plant Manager", branchId: "br-1" },
        { id: "emp-2", fullName: "Delivery Staff", branchId: null },
      ],
      branches: [{ id: "br-1", name: "Main Plant" }],
      vouchers: [
        { kind: "prepaid_card", status: "issued", balancePaise: 4000 },
        { kind: "prepaid_card", status: "redeemed", balancePaise: 0 },
        { kind: "promo", status: "created", balancePaise: null },
      ],
      voucherDiscountPaise: 1000,
      voucherRedeemedPaise: 2500,
      expenses: [
        { category: "detergent", amountPaise: 1200 },
        { category: "detergent", amountPaise: 800 },
        { category: "fuel", amountPaise: 500 },
      ],
      now,
    });
    eq("reports: sales day groups IST date", result.salesByDay.length, 1);
    eq("reports: sales day excludes cancelled", result.salesByDay[0].orders, 2);
    eq("reports: sales day gross", result.salesByDay[0].grossPaise, 15000);
    eq("reports: sales day collected", result.salesByDay[0].collectedPaise, 12000);
    eq("reports: by service revenue", result.salesByService.find((s) => s.key === "dry-cleaning")?.grossPaise, 10000);
    eq("reports: plant credited via handover", result.processedByPlant.find((p) => p.label === "Main Plant")?.orders, 1);
    eq("reports: plant unassigned for the rest", result.processedByPlant.find((p) => p.label === "Unassigned")?.orders, 1);
    eq("reports: aging 0-1 bucket", result.pendingAging.find((b) => b.bucket === "0–1 days")?.count, 1);
    eq("reports: aging over-7 bucket", result.pendingAging.find((b) => b.bucket === "Over 7 days")?.count, 1);
    eq("reports: employee handovers", result.employeePerformance.find((e) => e.employeeId === "emp-2")?.handovers, 2);
    eq("reports: employee flags", result.employeePerformance.find((e) => e.employeeId === "emp-2")?.flagsRaised, 1);
    eq("reports: employee deliveries", result.employeePerformance.find((e) => e.employeeId === "emp-2")?.deliveries, 1);
    eq("reports: voucher liability", result.voucherUsage.outstandingLiabilityPaise, 4000);
    eq("reports: voucher issued count", result.voucherUsage.issued, 2);
    eq("reports: retention customers", result.retention.customers, 2);
    eq("reports: retention repeat", result.retention.repeatCustomers, 1);
    eq("reports: retention rate", result.retention.repeatRatePercent, 50);
    eq("reports: expenses by category", result.expensesByCategory.find((e) => e.category === "detergent")?.totalPaise, 2000);
    eq("reports: net = collected − expenses", result.salesVsExpense.netPaise, 12000 - 2500);
  }

  /* ---------------------------------------------------------------- */
  /* 10 · Request schemas                                              */
  /* ---------------------------------------------------------------- */
  eq("schema: record cash ok", recordPaymentSchema.safeParse({ method: "cash", amountPaise: 1000 }).success, true);
  eq("schema: record upi with reference ok", recordPaymentSchema.safeParse({ method: "upi", amountPaise: 1000, reference: "UTR123" }).success, true);
  eq("schema: razorpay not recordable by hand", recordPaymentSchema.safeParse({ method: "razorpay", amountPaise: 1000 }).success, false);
  eq("schema: zero amount rejected", recordPaymentSchema.safeParse({ method: "cash", amountPaise: 0 }).success, false);
  eq("schema: fractional paise rejected", recordPaymentSchema.safeParse({ method: "cash", amountPaise: 10.5 }).success, false);
  eq("schema: refund ok", refundRequestSchema.safeParse({ amountPaise: 500, reason: "Damaged item", method: "original_payment" }).success, true);
  eq("schema: refund needs a reason", refundRequestSchema.safeParse({ amountPaise: 500, reason: "no", method: "cash" }).success, false);
  eq("schema: refund action ok", refundActionSchema.safeParse({ action: "process" }).success, true);
  eq("schema: refund action rejects delete", refundActionSchema.safeParse({ action: "delete" }).success, false);
  eq("schema: expense ok", expenseCreateSchema.safeParse({ expenseDate: "2026-11-04", category: "detergent", amountPaise: 12000 }).success, true);
  eq("schema: expense bad category", expenseCreateSchema.safeParse({ expenseDate: "2026-11-04", category: "party", amountPaise: 12000 }).success, false);
  eq("schema: close-day ok", closeDaySchema.safeParse({ date: "2026-11-04", countedCashPaise: 0 }).success, true);
  eq("schema: close-day negative counted rejected", closeDaySchema.safeParse({ date: "2026-11-04", countedCashPaise: -5 }).success, false);

  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length > 0) {
    console.log(`Failing: ${failures.join("; ")}`);
    process.exitCode = 1;
  }
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
