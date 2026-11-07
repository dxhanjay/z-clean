/**
 * Pricing-settings tests — plain node, no test framework.
 *
 * The admin settings keys minimum_order_paise / free_delivery_threshold_paise
 * (settings table, edited at /admin/settings) must actually drive the
 * totals engine. Compiles src/lib/totals.ts + src/lib/pricing.ts with the
 * project's own TypeScript into a scratch dir (CommonJS), then asserts:
 *  (a) with no settings, behaviour is EXACTLY the approved defaults
 *      (₹199 minimum, ₹299 free-delivery threshold, ₹40 fee below it);
 *  (b) resolved settings values change the computed totals accordingly;
 *  (c) missing / invalid settings fall back to the approved constants,
 *      per key, at both the resolver and the engine level.
 * The DB read itself (getPricingTerms) is a thin wrapper over
 * resolvePricingTerms + the settings table, mirroring getBusinessSettings.
 * Run: `npm run test:pricing-settings`. Exits non-zero on failure.
 */
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const scratch = mkdtempSync(join(tmpdir(), "zclean-pricing-settings-test-"));

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
  const {
    resolvePricingTerms,
    parsePaiseSetting,
    defaultPricingTermsPaise,
    publicPricingTermsPayload,
  } = require(join(scratch, "pricing.js"));

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
  const washFold = { serviceSlug: "laundry-wash-and-fold", itemName: "Wash & Fold" };
  const regular250 = {
    items: [{ ...shirt, qty: 2 }, { ...trouser, qty: 1 }],
    deliveryType: "regular",
    isFirstOrder: true,
  };

  /* ---- (a) Defaults: no settings anywhere → approved constants ------- */
  {
    eq("defaults: constant min ₹199", defaultPricingTermsPaise.minimumOrderPaise, 19900);
    eq("defaults: constant threshold ₹299", defaultPricingTermsPaise.freeDeliveryThresholdPaise, 29900);

    for (const [label, rows] of [["undefined", undefined], ["null", null], ["empty", []]]) {
      const r = resolvePricingTerms(rows);
      eq(`defaults (${label} rows): min`, r.minimumOrderPaise, 19900);
      eq(`defaults (${label} rows): threshold`, r.freeDeliveryThresholdPaise, 29900);
      eq(`defaults (${label} rows): fromDatabase`, r.fromDatabase, false);
    }
    // Base schema state: threshold row exists but NULL, minimum row absent.
    const baseSchema = resolvePricingTerms([
      { key: "free_delivery_threshold_paise", value: null },
    ]);
    eq("defaults (base schema rows): min", baseSchema.minimumOrderPaise, 19900);
    eq("defaults (base schema rows): threshold", baseSchema.freeDeliveryThresholdPaise, 29900);
    eq("defaults (base schema rows): fromDatabase", baseSchema.fromDatabase, false);

    const r = computeOrderTotals(regular250);
    eq("defaults engine: ₹250 ok", r.ok, true);
    eq("defaults engine: ₹250 fee ₹40", r.deliveryFeePaise, 4000);
    eq("defaults engine: ₹250 total ₹290", r.totalPaise, 29000);

    const ironOnly = computeOrderTotals({
      items: [{ serviceSlug: "steam-iron-press", itemName: "Shirt / T-Shirt / Trouser / Kurta", qty: 1 }],
      deliveryType: "regular",
      isFirstOrder: true,
    });
    eq("defaults engine: ₹15 rejected", ironOnly.ok, false);
    eq("defaults engine: ₹15 code", ironOnly.code, "MIN_ORDER");
    check(
      "defaults engine: ₹15 message names ₹199",
      ironOnly.error.startsWith("Minimum order is ₹199."),
      `(got: ${ironOnly.error})`,
    );

    const at299 = computeOrderTotals({
      items: [
        { serviceSlug: "dry-cleaning", itemName: "Blanket — single", qty: 1 },
        { serviceSlug: "steam-iron-press", itemName: "Suit — 2 piece (press)", qty: 1 },
      ],
      deliveryType: "regular",
      isFirstOrder: false,
    });
    eq("defaults engine: exactly ₹299 free delivery", at299.deliveryFeePaise, 0);
  }

  /* ---- (b) Settings values change the totals -------------------------- */
  {
    const lowered = resolvePricingTerms([
      { key: "minimum_order_paise", value: "9900" },
      { key: "free_delivery_threshold_paise", value: "19900" },
    ]);
    eq("settings: min resolved ₹99", lowered.minimumOrderPaise, 9900);
    eq("settings: threshold resolved ₹199", lowered.freeDeliveryThresholdPaise, 19900);
    eq("settings: fromDatabase", lowered.fromDatabase, true);

    // ₹140 of Wash & Fold: below the default ₹199 minimum (rejected),
    // accepted under a ₹99 minimum; still below the ₹199 free-delivery
    // threshold, so the ₹40 fee applies.
    const smallDefault = computeOrderTotals({
      items: [{ ...washFold, qty: 2 }],
      deliveryType: "regular",
      isFirstOrder: true,
    });
    eq("settings: ₹140 rejected by default min", smallDefault.code, "MIN_ORDER");
    const small = computeOrderTotals({
      items: [{ ...washFold, qty: 2 }],
      deliveryType: "regular",
      isFirstOrder: true,
      terms: lowered,
    });
    eq("settings: ₹140 accepted at min ₹99", small.ok, true);
    eq("settings: ₹140 fee ₹40 (net < ₹199)", small.deliveryFeePaise, 4000);
    eq("settings: ₹140 total ₹180", small.totalPaise, 18000);

    // ₹210 of Wash & Fold: fee ₹40 by default (net < ₹299), free under
    // the lowered ₹199 threshold.
    const mid = computeOrderTotals({
      items: [{ ...washFold, qty: 3 }],
      deliveryType: "regular",
      isFirstOrder: true,
      terms: lowered,
    });
    eq("settings: ₹210 free delivery at threshold ₹199", mid.deliveryFeePaise, 0);
    eq("settings: ₹210 total ₹210", mid.totalPaise, 21000);

    // Threshold applies AFTER discount: FIRST20 on a ₹299 suit nets
    // ₹239.20 — a ₹40 fee under the default ₹299 threshold, free under
    // the lowered ₹199 threshold.
    const suitDiscounted = computeOrderTotals({
      items: [{ serviceSlug: "dry-cleaning", itemName: "Suit — 2 piece", qty: 1 }],
      deliveryType: "regular",
      couponCode: "FIRST20",
      isFirstOrder: true,
      terms: lowered,
    });
    eq("settings: discounted net ₹239.20 free delivery", suitDiscounted.deliveryFeePaise, 0);
    eq("settings: discounted total ₹239.20", suitDiscounted.totalPaise, 23920);

    // Raised threshold only: the ₹375 express order (free delivery by
    // default) pays the fee when the threshold is ₹499.
    const raisedThreshold = computeOrderTotals({
      items: [{ ...shirt, qty: 2 }, { ...trouser, qty: 1 }],
      deliveryType: "express",
      isFirstOrder: true,
      terms: { freeDeliveryThresholdPaise: 49900 },
    });
    eq("settings: ₹375 express fee ₹40 at threshold ₹499", raisedThreshold.deliveryFeePaise, 4000);
    eq("settings: ₹375 express total ₹415", raisedThreshold.totalPaise, 41500);

    // Raised minimum only: the ₹250 order is rejected and the message
    // names the configured minimum, not the default.
    const raisedMin = computeOrderTotals({
      ...regular250,
      terms: { minimumOrderPaise: 49900 },
    });
    eq("settings: ₹250 rejected at min ₹499", raisedMin.ok, false);
    eq("settings: ₹250 code", raisedMin.code, "MIN_ORDER");
    check(
      "settings: message names ₹499",
      raisedMin.error.startsWith("Minimum order is ₹499."),
      `(got: ${raisedMin.error})`,
    );

    // Partial rows: each key falls back independently.
    const onlyThreshold = resolvePricingTerms([
      { key: "free_delivery_threshold_paise", value: "49900" },
    ]);
    eq("settings (threshold only): min falls back", onlyThreshold.minimumOrderPaise, 19900);
    eq("settings (threshold only): threshold applied", onlyThreshold.freeDeliveryThresholdPaise, 49900);
    eq("settings (threshold only): fromDatabase", onlyThreshold.fromDatabase, true);
    const onlyMin = resolvePricingTerms([
      { key: "minimum_order_paise", value: "9900" },
    ]);
    eq("settings (min only): min applied", onlyMin.minimumOrderPaise, 9900);
    eq("settings (min only): threshold falls back", onlyMin.freeDeliveryThresholdPaise, 29900);
    eq("settings (min only): fromDatabase", onlyMin.fromDatabase, true);
  }

  /* ---- (c) Invalid / corrupt settings fall back ----------------------- */
  {
    eq("parse: plain value", parsePaiseSetting("19900"), 19900);
    eq("parse: whitespace trimmed", parsePaiseSetting(" 29900 "), 29900);
    eq("parse: null", parsePaiseSetting(null), null);
    eq("parse: undefined", parsePaiseSetting(undefined), null);
    eq("parse: empty", parsePaiseSetting(""), null);
    eq("parse: non-numeric", parsePaiseSetting("abc"), null);
    eq("parse: zero", parsePaiseSetting("0"), null);
    eq("parse: negative", parsePaiseSetting("-500"), null);
    eq("parse: fractional paise", parsePaiseSetting("199.5"), null);
    eq("parse: absurdly large", parsePaiseSetting("99999999999"), null);

    const garbageOne = resolvePricingTerms([
      { key: "minimum_order_paise", value: "abc" },
      { key: "free_delivery_threshold_paise", value: "49900" },
    ]);
    eq("fallback: corrupt min → default", garbageOne.minimumOrderPaise, 19900);
    eq("fallback: valid threshold still applied", garbageOne.freeDeliveryThresholdPaise, 49900);
    eq("fallback: fromDatabase (one valid)", garbageOne.fromDatabase, true);

    const garbageBoth = resolvePricingTerms([
      { key: "minimum_order_paise", value: "" },
      { key: "free_delivery_threshold_paise", value: "-1" },
    ]);
    eq("fallback: both corrupt → min default", garbageBoth.minimumOrderPaise, 19900);
    eq("fallback: both corrupt → threshold default", garbageBoth.freeDeliveryThresholdPaise, 29900);
    eq("fallback: both corrupt → fromDatabase false", garbageBoth.fromDatabase, false);

    // Engine level: invalid override values are ignored, per term.
    const zeroMin = computeOrderTotals({
      items: [{ ...washFold, qty: 2 }],
      deliveryType: "regular",
      isFirstOrder: true,
      terms: { minimumOrderPaise: 0 },
    });
    eq("fallback engine: min override 0 ignored (₹140 rejected)", zeroMin.code, "MIN_ORDER");
    const nanMin = computeOrderTotals({
      items: [{ ...washFold, qty: 2 }],
      deliveryType: "regular",
      isFirstOrder: true,
      terms: { minimumOrderPaise: NaN },
    });
    eq("fallback engine: min override NaN ignored", nanMin.code, "MIN_ORDER");
    const fractionalMin = computeOrderTotals({
      items: [{ ...washFold, qty: 2 }],
      deliveryType: "regular",
      isFirstOrder: true,
      terms: { minimumOrderPaise: 9900.5 },
    });
    eq("fallback engine: fractional min ignored", fractionalMin.code, "MIN_ORDER");
    const negativeThreshold = computeOrderTotals({
      items: [{ ...shirt, qty: 2 }, { ...trouser, qty: 1 }],
      deliveryType: "express",
      isFirstOrder: true,
      terms: { freeDeliveryThresholdPaise: -1 },
    });
    eq("fallback engine: negative threshold ignored (₹375 free delivery)", negativeThreshold.deliveryFeePaise, 0);
    const emptyTerms = computeOrderTotals({ ...regular250, terms: {} });
    eq("fallback engine: empty terms = defaults (fee ₹40)", emptyTerms.deliveryFeePaise, 4000);
    eq("fallback engine: empty terms = defaults (total ₹290)", emptyTerms.totalPaise, 29000);
  }

  {
    // Public payload for GET /api/pricing-terms (mobile mirror).
    const dflt = publicPricingTermsPayload(defaultPricingTermsPaise);
    eq("payload: default minimum 19900", dflt.minimumOrderPaise, 19900);
    eq("payload: default threshold 29900", dflt.freeDeliveryThresholdPaise, 29900);
    eq("payload: delivery fee constant 4000", dflt.deliveryFeePaise, 4000);
    const custom = publicPricingTermsPayload({
      minimumOrderPaise: 24900,
      freeDeliveryThresholdPaise: 49900,
    });
    eq("payload: settings minimum passes through", custom.minimumOrderPaise, 24900);
    eq("payload: settings threshold passes through", custom.freeDeliveryThresholdPaise, 49900);
    eq("payload: fee stays the approved constant", custom.deliveryFeePaise, 4000);
  }

  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length > 0) {
    console.error(`Failing: ${failures.join("; ")}`);
    process.exit(1);
  }
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
