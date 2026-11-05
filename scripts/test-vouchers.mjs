/**
 * Gift voucher tests (Phase 7b) — plain node, no test framework.
 *
 * Compiles src/lib/vouchers.ts (pure rules) AND src/lib/validation.ts
 * (the checkout schema, incl. the voucherCode field) with the project's
 * own TypeScript into a scratch dir INSIDE the project — so the
 * compiled validation.js can resolve zod from the project's
 * node_modules — then asserts the code generator, the full validation
 * matrix, the prepaid/promo status math, the coupon-conflict rule, and
 * the order schema's voucher handling. Run: `npm run test:vouchers`.
 * Exits non-zero on failure (all failures are printed).
 */
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtempSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const scratch = mkdtempSync(join(projectRoot, ".test-scratch-vouchers-"));

try {
  const tscBin = join(projectRoot, "node_modules", ".bin", "tsc");
  execFileSync(
    tscBin,
    [
      "src/lib/vouchers.ts",
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
  const vouchers = require(join(scratch, "vouchers.js"));
  const validation = require(join(scratch, "validation.js"));
  const {
    VOUCHER_CODE_RE,
    generateVoucherCode,
    hasVoucherCouponConflict,
    isVoucherCodeFormat,
    prepaidStatusAfter,
    promoStatusAfter,
    validateVoucher,
    DEMO_VOUCHERS,
  } = vouchers;
  const { orderSchema, voucherCreateSchema, redeemVoucherSchema } = validation;

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

  const NOW = new Date(2026, 10, 4); // 4 Nov 2026, local
  function promo(overrides = {}) {
    return {
      id: "v-promo",
      code: "ZCGIFT-ABCDEFGH",
      kind: "promo",
      faceValuePaise: null,
      balancePaise: null,
      discountType: "percent",
      discountValue: 10,
      maxDiscountPaise: null,
      minOrderPaise: 0,
      eligibleServices: [],
      branchId: null,
      usageLimit: 1,
      timesUsed: 0,
      status: "issued",
      issuedToName: "Test",
      issuedToPhone: null,
      issuedToEmployeeId: null,
      issuedByLabel: "test",
      validFrom: null,
      validUntil: null,
      createdAt: "2026-11-01T00:00:00.000Z",
      ...overrides,
    };
  }
  function card(overrides = {}) {
    return {
      ...promo(),
      id: "v-card",
      kind: "prepaid_card",
      faceValuePaise: 50000,
      balancePaise: 50000,
      discountType: null,
      discountValue: null,
      ...overrides,
    };
  }
  const CTX = { subtotalPaise: 40000, serviceSlugs: ["laundry-wash-and-fold"], now: NOW };

  // 1 · Code format + generation.
  check("code: regex accepts a generated code", VOUCHER_CODE_RE.test(generateVoucherCode()));
  check("code: format helper normalises case/space", isVoucherCodeFormat("  zcgift-abcdefgh "));
  check(
    "code: alphabet excludes 0/O/1/I/L",
    !/[01IOL]/.test(generateVoucherCode(() => 0).slice(7)) &&
      generateVoucherCode(() => 0) === "ZCGIFT-AAAAAAAA",
  );
  {
    const seq = [0, 1, 2, 3, 4, 5, 6, 7];
    let i = 0;
    eq("code: injectable RNG maps alphabet in order", generateVoucherCode(() => seq[i++]), "ZCGIFT-ABCDEFGH");
  }
  {
    const codes = new Set();
    for (let n = 0; n < 500; n += 1) codes.add(generateVoucherCode());
    eq("code: 500 generations unique", codes.size, 500);
    check("code: all 500 match the format", [...codes].every((c) => VOUCHER_CODE_RE.test(c)));
    check("code: none contain ambiguous chars", [...codes].every((c) => !/[01IOL]/.test(c.slice(7))));
  }
  check("demo seeds: both demo codes are valid format", DEMO_VOUCHERS.every((v) => isVoucherCodeFormat(v.code)));

  // 2 · Status gating.
  eq("status: created rejected", validateVoucher(promo({ status: "created" }), CTX).ok, false);
  eq("status: issued accepted", validateVoucher(promo(), CTX).ok, true);
  eq("status: partially_redeemed accepted", validateVoucher(card({ status: "partially_redeemed", balancePaise: 10000 }), CTX).ok, true);
  eq("status: redeemed rejected", validateVoucher(promo({ status: "redeemed" }), CTX).ok, false);
  eq("status: expired rejected", validateVoucher(promo({ status: "expired" }), CTX).ok, false);
  eq("status: cancelled rejected", validateVoucher(promo({ status: "cancelled" }), CTX).ok, false);

  // 3 · Validity window.
  eq("window: before valid_from rejected", validateVoucher(promo({ validFrom: "2026-12-01" }), CTX).ok, false);
  eq("window: on valid_from accepted", validateVoucher(promo({ validFrom: "2026-11-04" }), CTX).ok, true);
  eq("window: after valid_until rejected", validateVoucher(promo({ validUntil: "2026-11-03" }), CTX).ok, false);
  eq("window: on valid_until accepted", validateVoucher(promo({ validUntil: "2026-11-04" }), CTX).ok, true);
  eq("window: open-ended accepted", validateVoucher(promo({ validFrom: null, validUntil: null }), CTX).ok, true);

  // 4 · Min order.
  eq("min order: below rejected", validateVoucher(promo({ minOrderPaise: 49900 }), CTX).ok, false);
  eq("min order: exactly at accepted", validateVoucher(promo({ minOrderPaise: 40000 }), CTX).ok, true);

  // 5 · Promo discount math.
  eq("promo percent: 10% of ₹400", validateVoucher(promo(), CTX).discountPaise, 4000);
  eq(
    "promo percent: capped at max",
    validateVoucher(promo({ maxDiscountPaise: 1500 }), CTX).discountPaise,
    1500,
  );
  eq(
    "promo percent: rounds to nearest paise",
    validateVoucher(promo({ discountValue: 15 }), { ...CTX, subtotalPaise: 33333 }).discountPaise,
    5000,
  );
  eq(
    "promo fixed: flat amount",
    validateVoucher(promo({ discountType: "fixed", discountValue: 10000 }), CTX).discountPaise,
    10000,
  );
  eq(
    "promo fixed: never exceeds subtotal",
    validateVoucher(promo({ discountType: "fixed", discountValue: 9999999 }), CTX).discountPaise,
    40000,
  );
  eq(
    "promo percent 100: equals subtotal",
    validateVoucher(promo({ discountValue: 100 }), CTX).discountPaise,
    40000,
  );
  eq("promo: redeemable is 0", validateVoucher(promo(), CTX).redeemablePaise, 0);

  // 6 · Usage limit (promo only).
  eq("usage: at limit rejected", validateVoucher(promo({ timesUsed: 1, usageLimit: 1 }), CTX).ok, false);
  eq("usage: below limit accepted", validateVoucher(promo({ timesUsed: 1, usageLimit: 3 }), CTX).ok, true);
  eq("promo status: last use redeems", promoStatusAfter(promo({ timesUsed: 0, usageLimit: 1 })), "redeemed");
  eq("promo status: mid-limit stays issued", promoStatusAfter(promo({ timesUsed: 0, usageLimit: 3 })), "issued");

  // 7 · Eligible services.
  eq(
    "services: order fully eligible",
    validateVoucher(promo({ eligibleServices: ["laundry-wash-and-fold"] }), CTX).ok,
    true,
  );
  eq(
    "services: foreign service in order rejected",
    validateVoucher(promo({ eligibleServices: ["dry-cleaning"] }), CTX).ok,
    false,
  );
  eq(
    "services: one ineligible item rejects the whole order",
    validateVoucher(promo({ eligibleServices: ["laundry-wash-and-fold"] }), {
      ...CTX,
      serviceSlugs: ["laundry-wash-and-fold", "shoe-care"],
    }).ok,
    false,
  );
  eq("services: empty list = all eligible", validateVoucher(promo({ eligibleServices: [] }), CTX).ok, true);

  // 8 · Branch restriction.
  eq(
    "branch: same branch accepted",
    validateVoucher(promo({ branchId: "b1" }), { ...CTX, branchId: "b1" }).ok,
    true,
  );
  eq(
    "branch: different branch rejected",
    validateVoucher(promo({ branchId: "b1" }), { ...CTX, branchId: "b2" }).ok,
    false,
  );
  eq(
    "branch: no branch context does not reject (documented)",
    validateVoucher(promo({ branchId: "b1" }), CTX).ok,
    true,
  );

  // 9 · Prepaid math.
  eq(
    "prepaid: full cover when balance >= due",
    validateVoucher(card(), { ...CTX, amountDuePaise: 29000 }).redeemablePaise,
    29000,
  );
  eq(
    "prepaid: partial when balance < due",
    validateVoucher(card({ balancePaise: 12000 }), { ...CTX, amountDuePaise: 29000 }).redeemablePaise,
    12000,
  );
  eq(
    "prepaid: defaults due to subtotal",
    validateVoucher(card({ balancePaise: 12000 }), CTX).redeemablePaise,
    12000,
  );
  eq("prepaid: zero balance rejected", validateVoucher(card({ balancePaise: 0 }), CTX).ok, false);
  eq("prepaid: discount is 0", validateVoucher(card(), CTX).discountPaise, 0);
  eq("prepaid: usage limit does not apply", validateVoucher(card({ timesUsed: 9, usageLimit: 1 }), CTX).ok, true);
  {
    const after = prepaidStatusAfter(card(), 29000);
    eq("prepaid status: partial keeps balance", after.balancePaise, 21000);
    eq("prepaid status: partial → partially_redeemed", after.status, "partially_redeemed");
    const done = prepaidStatusAfter(card(), 50000);
    eq("prepaid status: full spend → redeemed", done.status, "redeemed");
    eq("prepaid status: full spend zeroes balance", done.balancePaise, 0);
    eq("prepaid status: over-spend clamps at 0", prepaidStatusAfter(card(), 999999).balancePaise, 0);
  }

  // 10 · Coupon conflict rule.
  eq("conflict: both present", hasVoucherCouponConflict("FIRST20", "ZCGIFT-ABCDEFGH"), true);
  eq("conflict: coupon only", hasVoucherCouponConflict("FIRST20", ""), false);
  eq("conflict: voucher only", hasVoucherCouponConflict("", "ZCGIFT-ABCDEFGH"), false);
  eq("conflict: neither", hasVoucherCouponConflict(null, undefined), false);
  eq("conflict: whitespace coupon ignored", hasVoucherCouponConflict("  ", "ZCGIFT-ABCDEFGH"), false);

  // 11 · Checkout schema: voucherCode field + conflict inputs parse.
  // pickupDate must be >= today per the schema's live-clock refinement —
  // compute tomorrow dynamically so this fixture never time-bombs.
  const tmr = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const tmrStr = `${tmr.getFullYear()}-${String(tmr.getMonth() + 1).padStart(2, "0")}-${String(tmr.getDate()).padStart(2, "0")}`;
  const baseOrder = {
    name: "Test Customer",
    phone: "9876543210",
    addressLine: "Qtr 12, Sector 4",
    area: "Sector 4",
    city: "Bokaro Steel City",
    pincode: "827004",
    pickupDate: tmrStr,
    pickupSlot: "9 AM – 11 AM",
    deliveryType: "regular",
    items: [{ serviceSlug: "dry-cleaning", itemName: "Shirt", qty: 2 }],
    paymentMethod: "cod",
    expectedTotalPaise: 20000,
  };
  eq("schema: order without voucher parses", orderSchema.safeParse(baseOrder).success, true);
  eq(
    "schema: order with voucher parses and keeps it",
    orderSchema.safeParse({ ...baseOrder, voucherCode: "ZCGIFT-ABCDEFGH" }).success &&
      orderSchema.parse({ ...baseOrder, voucherCode: "ZCGIFT-ABCDEFGH" }).voucherCode === "ZCGIFT-ABCDEFGH",
    true,
  );
  eq("schema: empty voucher string allowed", orderSchema.safeParse({ ...baseOrder, voucherCode: "" }).success, true);
  eq("schema: overlong voucher rejected", orderSchema.safeParse({ ...baseOrder, voucherCode: "X".repeat(31) }).success, false);

  // 12 · Voucher create schema guards.
  eq("create schema: prepaid needs face value", voucherCreateSchema.safeParse({ kind: "prepaid_card" }).success, false);
  eq("create schema: prepaid ok", voucherCreateSchema.safeParse({ kind: "prepaid_card", faceValuePaise: 50000 }).success, true);
  eq("create schema: promo needs discount", voucherCreateSchema.safeParse({ kind: "promo" }).success, false);
  eq(
    "create schema: promo percent >100 rejected",
    voucherCreateSchema.safeParse({ kind: "promo", discountType: "percent", discountValue: 150 }).success,
    false,
  );
  eq(
    "create schema: promo ok with cap",
    voucherCreateSchema.safeParse({ kind: "promo", discountType: "percent", discountValue: 10, maxDiscountPaise: 15000, quantity: 50 }).success,
    true,
  );
  eq(
    "create schema: quantity >50 rejected",
    voucherCreateSchema.safeParse({ kind: "prepaid_card", faceValuePaise: 50000, quantity: 51 }).success,
    false,
  );
  eq(
    "create schema: inverted validity rejected",
    voucherCreateSchema.safeParse({ kind: "prepaid_card", faceValuePaise: 50000, validFrom: "2026-12-01", validUntil: "2026-11-01" }).success,
    false,
  );
  eq(
    "create schema: unknown service slug rejected",
    voucherCreateSchema.safeParse({ kind: "promo", discountType: "fixed", discountValue: 1000, eligibleServices: ["not-a-service"] }).success,
    false,
  );
  eq("redeem schema: code required", redeemVoucherSchema.safeParse({ code: "ZCGIFT-ABCDEFGH" }).success, true);
  eq("redeem schema: blank rejected", redeemVoucherSchema.safeParse({ code: " " }).success, false);

  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length > 0) {
    console.log(`Failing: ${failures.join("; ")}`);
    process.exitCode = 1;
  }
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
