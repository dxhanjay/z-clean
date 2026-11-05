/**
 * Review helper tests (Delta 3) — plain node, no test framework.
 * Compiles src/lib/reviews.ts with the project's own TypeScript into
 * a scratch dir, then asserts the pure integrity helpers the review
 * system relies on: eligibility verdicts (delivered-only, one per
 * order), the privacy-safe first-name byline, star rendering, and
 * the public DTO join normalisation.
 * The routes and RLS are exercised live, not here.
 * Run: `npm run test:reviews`. Exits non-zero on any failure.
 */
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const scratch = mkdtempSync(join(tmpdir(), "zclean-reviews-test-"));

try {
  const tscBin = join(projectRoot, "node_modules", ".bin", "tsc");
  execFileSync(
    tscBin,
    [
      "src/lib/reviews.ts",
      "--module", "commonjs",
      "--target", "es2022",
      "--moduleResolution", "node",
      "--skipLibCheck",
      "--outDir", scratch,
    ],
    { cwd: projectRoot, stdio: "inherit" },
  );

  const require = createRequire(import.meta.url);
  const {
    reviewEligibility,
    reviewerFirstName,
    starsFor,
    toPublicReview,
    APPROVED_REVIEW_LIMIT,
  } = require(join(scratch, "reviews.js"));

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

  // ── Eligibility ──────────────────────────────────────────────────
  eq(
    "eligible: delivered, not yet reviewed",
    reviewEligibility({ status: "DELIVERED" }, false).eligible,
    true,
  );
  const dup = reviewEligibility({ status: "DELIVERED" }, true);
  eq("duplicate: not eligible", dup.eligible, false);
  eq("duplicate: code", dup.code, "ALREADY_REVIEWED");
  const early = reviewEligibility({ status: "IN_PROCESS" }, false);
  eq("not delivered: not eligible", early.eligible, false);
  eq("not delivered: code", early.code, "ORDER_NOT_DELIVERED");
  eq(
    "not delivered: placed order",
    reviewEligibility({ status: "PLACED" }, false).code,
    "ORDER_NOT_DELIVERED",
  );
  eq(
    "existing review wins over status check",
    reviewEligibility({ status: "CANCELLED" }, true).code,
    "ALREADY_REVIEWED",
  );

  // ── Privacy-safe byline ──────────────────────────────────────────
  eq("first name only", reviewerFirstName("Asha Verma"), "Asha");
  eq("first name trims padding", reviewerFirstName("  Ravi   Kumar "), "Ravi");
  eq("single name kept", reviewerFirstName("Madonna"), "Madonna");
  eq("missing name falls back", reviewerFirstName(null), "Customer");
  eq("blank name falls back", reviewerFirstName("   "), "Customer");
  eq("undefined name falls back", reviewerFirstName(undefined), "Customer");

  // ── Stars ────────────────────────────────────────────────────────
  eq("stars: 5", starsFor(5), "★★★★★");
  eq("stars: 3", starsFor(3), "★★★☆☆");
  eq("stars: 1", starsFor(1), "★☆☆☆☆");
  eq("stars: clamps low", starsFor(0), "★☆☆☆☆");
  eq("stars: clamps high", starsFor(9), "★★★★★");

  // ── Public DTO ───────────────────────────────────────────────────
  const base = {
    id: "r1",
    rating: 5,
    text: "Spotless suits, delivered on time.",
    created_at: "2026-11-04T10:00:00.000Z",
  };
  const objForm = toPublicReview({
    ...base,
    profiles: { name: "Priya Sharma" },
    orders: { addresses: { area: "Sector 4 / City Centre" } },
  });
  eq("dto: object joins — name", objForm.reviewerName, "Priya");
  eq("dto: object joins — area", objForm.area, "Sector 4 / City Centre");
  eq("dto: rating passes through", objForm.rating, 5);

  const arrForm = toPublicReview({
    ...base,
    profiles: [{ name: "Rahul Dev" }],
    orders: { addresses: [{ area: "Chas" }] },
  });
  eq("dto: array joins — name", arrForm.reviewerName, "Rahul");
  eq("dto: array joins — area", arrForm.area, "Chas");

  const sparse = toPublicReview({ ...base, profiles: null, orders: null });
  eq("dto: no profile → Customer", sparse.reviewerName, "Customer");
  eq("dto: no address → area null", sparse.area, null);

  const blankArea = toPublicReview({
    ...base,
    profiles: { name: null },
    orders: { addresses: { area: "  " } },
  });
  eq("dto: blank area → null", blankArea.area, null);
  eq("dto: null name → Customer", blankArea.reviewerName, "Customer");

  eq("approved limit is 12", APPROVED_REVIEW_LIMIT, 12);

  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length > 0) process.exit(1);
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
