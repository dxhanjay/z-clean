/**
 * Totals-engine tests (Phase 3) — plain node, no test framework.
 *
 * Compiles src/lib/totals.ts + src/lib/pricing.ts with the project's own
 * TypeScript into a scratch dir (CommonJS), then asserts order maths:
 * regular orders, express 1.5×, FIRST20, the ₹299 free-delivery boundary,
 * and minimum-order rejection. Run: `npm run test:totals`.
 * Exits non-zero on the first failing batch (all failures are printed).
 */
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const scratch = mkdtempSync(join(tmpdir(), "zclean-totals-test-"));

try {
  const tscBin = join(projectRoot, "node_modules", ".bin", "tsc");
  execFileSync(
    tscBin,
    [
      "src/lib/totals.ts",
      "src/lib/pricing.ts",
      "--module", "commonjs",
      "--target", "es2020",
      "--moduleResolution", "node",
      "--skipLibCheck",
      "--outDir", scratch,
    ],
    { cwd: projectRoot, stdio: "inherit" },
  );

  const require = createRequire(import.meta.url);
  const { computeOrderTotals } = require(join(scratch, "totals.js"));

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

  const shirt = { serviceSlug: "dry-cleaning", itemName: "Shirt / T-Shirt" };
  const trouser = { serviceSlug: "dry-cleaning", itemName: "Trouser / Jeans" };

  // 1 · Regular order: 2 shirts (₹80) + 1 trouser (₹90) = ₹250 → fee ₹40.
  {
    const r = computeOrderTotals({
      items: [{ ...shirt, qty: 2 }, { ...trouser, qty: 1 }],
      deliveryType: "regular",
      isFirstOrder: true,
    });
    eq("regular: ok", r.ok, true);
    eq("regular: subtotal ₹250", r.subtotalPaise, 25000);
    eq("regular: no discount", r.discountPaise, 0);
    eq("regular: delivery fee ₹40 below ₹299", r.deliveryFeePaise, 4000);
    eq("regular: total ₹290", r.totalPaise, 29000);
  }

  // 2 · Express 1.5×: shirts ₹120, trouser ₹135 → ₹375, free delivery.
  {
    const r = computeOrderTotals({
      items: [{ ...shirt, qty: 2 }, { ...trouser, qty: 1 }],
      deliveryType: "express",
      isFirstOrder: true,
    });
    eq("express: ok", r.ok, true);
    eq("express: unit shirt ₹120", r.lines[0].unitPricePaise, 12000);
    eq("express: unit trouser ₹135", r.lines[1].unitPricePaise, 13500);
    eq("express: subtotal ₹375", r.subtotalPaise, 37500);
    eq("express: free delivery ≥ ₹299", r.deliveryFeePaise, 0);
    eq("express: total ₹375", r.totalPaise, 37500);
  }

  // 3 · FIRST20 on first order: suit 2pc ₹299 → 20% off = ₹59.80,
  //     net ₹239.20 drops below ₹299 → ₹40 fee returns → total ₹279.20.
  {
    const r = computeOrderTotals({
      items: [{ serviceSlug: "dry-cleaning", itemName: "Suit — 2 piece", qty: 1 }],
      deliveryType: "regular",
      couponCode: "FIRST20",
      isFirstOrder: true,
    });
    eq("coupon: ok", r.ok, true);
    eq("coupon: subtotal ₹299", r.subtotalPaise, 29900);
    eq("coupon: discount ₹59.80", r.discountPaise, 5980);
    eq("coupon: fee ₹40 after discount drops net < ₹299", r.deliveryFeePaise, 4000);
    eq("coupon: total ₹279.20", r.totalPaise, 27920);
    eq("coupon: applied code", r.couponApplied, "FIRST20");
  }

  // 4 · Free-delivery boundary: exactly ₹299 → free; ₹249 alone → ₹40 fee.
  {
    const atBoundary = computeOrderTotals({
      items: [
        { serviceSlug: "dry-cleaning", itemName: "Blanket — single", qty: 1 }, // ₹249
        { serviceSlug: "steam-iron-press", itemName: "Suit — 2 piece (press)", qty: 1 }, // ₹50
      ],
      deliveryType: "regular",
      isFirstOrder: false,
    });
    eq("boundary: subtotal exactly ₹299", atBoundary.subtotalPaise, 29900);
    eq("boundary: fee ₹0 at ₹299", atBoundary.deliveryFeePaise, 0);
    eq("boundary: total ₹299", atBoundary.totalPaise, 29900);

    const below = computeOrderTotals({
      items: [{ serviceSlug: "dry-cleaning", itemName: "Blanket — single", qty: 1 }],
      deliveryType: "regular",
      isFirstOrder: false,
    });
    eq("below boundary: fee ₹40 at ₹249", below.deliveryFeePaise, 4000);
    eq("below boundary: total ₹289", below.totalPaise, 28900);
  }

  // 5 · Minimum order ₹199 (pre-discount subtotal): ₹15 iron-only → reject.
  {
    const r = computeOrderTotals({
      items: [
        { serviceSlug: "steam-iron-press", itemName: "Shirt / T-Shirt / Trouser / Kurta", qty: 1 },
      ],
      deliveryType: "regular",
      isFirstOrder: true,
    });
    eq("min-order: rejected", r.ok, false);
    eq("min-order: code", r.code, "MIN_ORDER");
  }

  // 6 · FIRST20 is first-order only.
  {
    const r = computeOrderTotals({
      items: [{ serviceSlug: "dry-cleaning", itemName: "Suit — 2 piece", qty: 1 }],
      deliveryType: "regular",
      couponCode: "FIRST20",
      isFirstOrder: false,
    });
    eq("coupon repeat: rejected", r.ok, false);
    eq("coupon repeat: code", r.code, "COUPON_NOT_FIRST_ORDER");
  }

  // 7 · Unknown coupon and unknown item are clear errors.
  {
    const badCoupon = computeOrderTotals({
      items: [{ ...shirt, qty: 3 }],
      deliveryType: "regular",
      couponCode: "NOPE50",
      isFirstOrder: true,
    });
    eq("bad coupon: rejected", badCoupon.ok, false);
    eq("bad coupon: code", badCoupon.code, "INVALID_COUPON");

    const badItem = computeOrderTotals({
      items: [{ serviceSlug: "dry-cleaning", itemName: "Moon Suit", qty: 1 }],
      deliveryType: "regular",
      isFirstOrder: true,
    });
    eq("unknown item: rejected", badItem.ok, false);
    eq("unknown item: code", badItem.code, "UNKNOWN_ITEM");
  }

  // 8 · Per-kg fractional qty: Wash & Fold 3.5 kg × ₹70 = ₹245 + ₹40 fee.
  {
    const r = computeOrderTotals({
      items: [{ serviceSlug: "laundry-wash-and-fold", itemName: "Wash & Fold", qty: 3.5 }],
      deliveryType: "regular",
      isFirstOrder: true,
    });
    eq("per-kg: line total ₹245", r.lines[0].lineTotalPaise, 24500);
    eq("per-kg: total ₹285", r.totalPaise, 28500);
  }

  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length > 0) {
    console.error(`Failing: ${failures.join("; ")}`);
    process.exit(1);
  }
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
