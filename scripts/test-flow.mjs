/**
 * Order-flow tests (Phase 4) — plain node, no test framework.
 *
 * Compiles src/lib/order-flow.ts with the project's own TypeScript into
 * a scratch dir, then asserts the transition rules from ARCHITECTURE.md
 * §5: happy path advances one step at a time, skips and backwards moves
 * are rejected, cancellation is allowed only before pickup, DELIVERED
 * and CANCELLED are terminal, and payment side-states are not steps.
 * Run: `npm run test:flow`. Exits non-zero if any check fails.
 */
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const scratch = mkdtempSync(join(tmpdir(), "zclean-flow-test-"));

try {
  const tscBin = join(projectRoot, "node_modules", ".bin", "tsc");
  execFileSync(
    tscBin,
    [
      "src/lib/order-flow.ts",
      "--module", "commonjs",
      "--target", "es2022",
      "--moduleResolution", "node",
      "--skipLibCheck",
      "--outDir", scratch,
    ],
    { cwd: projectRoot, stdio: "inherit" },
  );

  const require = createRequire(import.meta.url);
  const flow = require(join(scratch, "order-flow.js"));
  const { canTransition, nextStatuses, stepIndex, ORDER_STEPS } = flow;

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
    check(name, JSON.stringify(actual) === JSON.stringify(expected),
      `(expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`);
  }

  const path = ORDER_STEPS.map((s) => s.status);
  eq("canonical path order", path, [
    "PLACED", "PICKUP_SCHEDULED", "PICKED_UP", "RECEIVED",
    "IN_PROCESS", "READY", "OUT_FOR_DELIVERY", "DELIVERED",
  ]);

  // 1 · Every happy-path step may advance exactly one step.
  for (let i = 0; i < path.length - 1; i += 1) {
    check(`advance ${path[i]} -> ${path[i + 1]}`, canTransition(path[i], path[i + 1]));
  }

  // 2 · Skipping a step is rejected.
  check("skip PLACED -> PICKED_UP rejected", !canTransition("PLACED", "PICKED_UP"));
  check("skip PLACED -> DELIVERED rejected", !canTransition("PLACED", "DELIVERED"));
  check("skip RECEIVED -> READY rejected", !canTransition("RECEIVED", "READY"));
  check("skip PICKUP_SCHEDULED -> RECEIVED rejected", !canTransition("PICKUP_SCHEDULED", "RECEIVED"));

  // 3 · Backwards moves and staying in place are rejected.
  check("backwards PICKED_UP -> PICKUP_SCHEDULED rejected", !canTransition("PICKED_UP", "PICKUP_SCHEDULED"));
  check("backwards DELIVERED -> READY rejected", !canTransition("DELIVERED", "READY"));
  check("same-status READY -> READY rejected", !canTransition("READY", "READY"));

  // 4 · Cancellation: allowed before pickup, never after.
  check("cancel from PLACED allowed", canTransition("PLACED", "CANCELLED"));
  check("cancel from PICKUP_SCHEDULED allowed", canTransition("PICKUP_SCHEDULED", "CANCELLED"));
  check("cancel after pickup (PICKED_UP) rejected", !canTransition("PICKED_UP", "CANCELLED"));
  check("cancel from IN_PROCESS rejected", !canTransition("IN_PROCESS", "CANCELLED"));
  check("cancel from READY rejected", !canTransition("READY", "CANCELLED"));
  check("cancel from DELIVERED rejected", !canTransition("DELIVERED", "CANCELLED"));

  // 5 · Terminal states have no outgoing transitions.
  eq("DELIVERED is terminal", nextStatuses("DELIVERED"), []);
  eq("CANCELLED is terminal", nextStatuses("CANCELLED"), []);
  check("DELIVERED -> anything rejected", !canTransition("DELIVERED", "PLACED"));

  // 6 · nextStatuses offers exactly the legal moves.
  eq("next from PLACED", nextStatuses("PLACED"), ["PICKUP_SCHEDULED", "CANCELLED"]);
  eq("next from PICKUP_SCHEDULED", nextStatuses("PICKUP_SCHEDULED"), ["PICKED_UP", "CANCELLED"]);
  eq("next from READY", nextStatuses("READY"), ["OUT_FOR_DELIVERY"]);
  eq("next from OUT_FOR_DELIVERY", nextStatuses("OUT_FOR_DELIVERY"), ["DELIVERED"]);

  // 7 · Payment side-states are not timeline steps and cannot be moved
  //     by status transitions (money state belongs to webhook / COD).
  eq("PAYMENT_PENDING is not a step", stepIndex("PAYMENT_PENDING"), -1);
  eq("PAYMENT_FAILED is not a step", stepIndex("PAYMENT_FAILED"), -1);
  eq("CANCELLED is not a step", stepIndex("CANCELLED"), -1);
  eq("no transitions out of PAYMENT_PENDING", nextStatuses("PAYMENT_PENDING"), []);
  check("cannot move INTO a payment side-state", !canTransition("PICKUP_SCHEDULED", "PAYMENT_FAILED"));

  // 8 · Unknown statuses are handled safely.
  eq("unknown status has no next steps", nextStatuses("WHATEVER"), []);
  check("unknown -> PLACED rejected", !canTransition("WHATEVER", "PLACED"));

  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length > 0) {
    console.error(`Failing: ${failures.join("; ")}`);
    process.exit(1);
  }
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
