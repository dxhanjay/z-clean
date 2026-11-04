/**
 * Payment-retry eligibility tests (Phase 5a) — plain node, no test
 * framework. Compiles src/lib/payment-retry.ts with the project's own
 * TypeScript into a scratch dir, then asserts the rule set used by
 * POST /api/orders/[id]/retry-payment: only Razorpay orders still
 * waiting for payment (pending/failed + PAYMENT_PENDING/PAYMENT_FAILED)
 * may retry; COD and already-paid orders are rejected with stable codes.
 * Run: `npm run test:retry`. Exits non-zero if any check fails.
 */
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const scratch = mkdtempSync(join(tmpdir(), "zclean-retry-test-"));

try {
  const tscBin = join(projectRoot, "node_modules", ".bin", "tsc");
  execFileSync(
    tscBin,
    [
      "src/lib/payment-retry.ts",
      "--module", "commonjs",
      "--target", "es2022",
      "--moduleResolution", "node",
      "--skipLibCheck",
      "--outDir", scratch,
    ],
    { cwd: projectRoot, stdio: "inherit" },
  );

  const require = createRequire(import.meta.url);
  const retry = require(join(scratch, "payment-retry.js"));
  const { paymentRetryEligibility, isPaymentRetryEligible } = retry;

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
  function codeOf(snapshot) {
    const r = paymentRetryEligibility(snapshot);
    return r.ok ? "OK" : r.code;
  }
  function eq(name, actual, expected) {
    check(name, actual === expected, `(expected ${expected}, got ${actual})`);
  }

  const base = { paymentMethod: "razorpay", paymentStatus: "pending", status: "PAYMENT_PENDING" };

  // 1 · The two genuinely retryable states.
  check("pending + PAYMENT_PENDING eligible", isPaymentRetryEligible(base));
  check(
    "failed + PAYMENT_FAILED eligible",
    isPaymentRetryEligible({ paymentMethod: "razorpay", paymentStatus: "failed", status: "PAYMENT_FAILED" }),
  );
  eq("eligible result code", codeOf(base), "OK");

  // 2 · COD can never be retried online.
  eq(
    "COD + cod_pending rejected",
    codeOf({ paymentMethod: "cod", paymentStatus: "cod_pending", status: "PICKUP_SCHEDULED" }),
    "NOT_RETRYABLE_COD",
  );
  eq(
    "COD + paid rejected as COD (method checked first)",
    codeOf({ paymentMethod: "cod", paymentStatus: "paid", status: "DELIVERED" }),
    "NOT_RETRYABLE_COD",
  );

  // 3 · Already paid is rejected.
  eq(
    "razorpay + paid rejected",
    codeOf({ paymentMethod: "razorpay", paymentStatus: "paid", status: "PICKUP_SCHEDULED" }),
    "ALREADY_PAID",
  );

  // 4 · Other money states are not retryable.
  eq(
    "razorpay + refunded rejected",
    codeOf({ paymentMethod: "razorpay", paymentStatus: "refunded", status: "REFUNDED" }),
    "NOT_RETRYABLE_STATE",
  );
  eq(
    "razorpay + cod_pending (inconsistent) rejected",
    codeOf({ paymentMethod: "razorpay", paymentStatus: "cod_pending", status: "PICKUP_SCHEDULED" }),
    "NOT_RETRYABLE_STATE",
  );

  // 5 · Money waiting but the order already moved on → not retryable.
  eq(
    "pending but status PICKUP_SCHEDULED rejected",
    codeOf({ paymentMethod: "razorpay", paymentStatus: "pending", status: "PICKUP_SCHEDULED" }),
    "NOT_RETRYABLE_STATE",
  );
  eq(
    "failed but status IN_PROCESS rejected",
    codeOf({ paymentMethod: "razorpay", paymentStatus: "failed", status: "IN_PROCESS" }),
    "NOT_RETRYABLE_STATE",
  );
  eq(
    "pending but status CANCELLED rejected",
    codeOf({ paymentMethod: "razorpay", paymentStatus: "pending", status: "CANCELLED" }),
    "NOT_RETRYABLE_STATE",
  );
  eq(
    "pending but status DELIVERED rejected",
    codeOf({ paymentMethod: "razorpay", paymentStatus: "pending", status: "DELIVERED" }),
    "NOT_RETRYABLE_STATE",
  );

  // 6 · Mismatched side-states (pending money + failed status and vice
  //     versa) stay eligible — the retry resets both, and the webhook
  //     guards key off payment_status.
  check(
    "pending + PAYMENT_FAILED eligible (retry resets both)",
    isPaymentRetryEligible({ paymentMethod: "razorpay", paymentStatus: "pending", status: "PAYMENT_FAILED" }),
  );
  check(
    "failed + PAYMENT_PENDING eligible (retry resets both)",
    isPaymentRetryEligible({ paymentMethod: "razorpay", paymentStatus: "failed", status: "PAYMENT_PENDING" }),
  );

  // 7 · Unknown payment methods are rejected, never guessed.
  eq(
    "unknown method rejected",
    codeOf({ paymentMethod: "upi-manual", paymentStatus: "pending", status: "PAYMENT_PENDING" }),
    "NOT_RETRYABLE_METHOD",
  );

  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length > 0) {
    console.error(`Failing: ${failures.join("; ")}`);
    process.exit(1);
  }
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
