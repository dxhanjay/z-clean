/**
 * Handover tests (Phase 8) — plain node, no test framework.
 *
 * Compiles the pure chain module (src/lib/handovers.ts, which pulls in
 * order-flow + org), the care-stage catalogue (src/lib/services.ts)
 * and the request schemas (src/lib/validation.ts) with the project's
 * own TypeScript into a scratch dir INSIDE the project — so compiled
 * output can resolve zod from the project's node_modules — then
 * asserts:
 *   1. chain integrity (order, roles exist in STAFF_ROLES, methods,
 *      care stages, status effects all legal per order-flow),
 *   2. next-point derivation across a full walk + status gating,
 *   3. OTP generation / verification / lockout math,
 *   4. QR payload round-trip,
 *   5. quantity flag logic,
 *   6. role matching,
 *   7. checkHandover end-to-end scenarios (incl. duplicates, sequence,
 *      wrong OTP, lock, QR mismatch, quantity flag),
 *   8. the zod request schemas.
 * Run: `npm run test:handovers`. Exits non-zero on failure.
 */
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtempSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const scratch = mkdtempSync(join(projectRoot, ".test-scratch-handovers-"));

try {
  const tscBin = join(projectRoot, "node_modules", ".bin", "tsc");
  execFileSync(
    tscBin,
    [
      "src/lib/handovers.ts",
      "src/lib/validation.ts",
      "src/lib/services.ts",
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
  const handovers = require(join(scratch, "handovers.js"));
  const flow = require(join(scratch, "order-flow.js"));
  const services = require(join(scratch, "services.js"));
  const validation = require(join(scratch, "validation.js"));
  const {
    HANDOVER_CHAIN,
    HANDOVER_FLAGS,
    OTP_MAX_ATTEMPTS,
    chainProgress,
    chainRolesAreValid,
    checkHandover,
    completedPointIds,
    employeeCanReceive,
    generateOtp,
    handoverPoint,
    isOtpFormat,
    nextHandoverPoint,
    orderItemCount,
    otpIsLocked,
    parseQrPayload,
    qrPayload,
    quantityFlags,
    receivingRoles,
    verifyOtp,
  } = handovers;
  const { canTransition } = flow;
  const { handoverCompleteSchema, regenerateOtpSchema } = validation;

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

  /* ---------------------------------------------------------------- */
  /* 1 · Chain integrity                                               */
  /* ---------------------------------------------------------------- */
  eq("chain: 11 points", HANDOVER_CHAIN.length, 11);
  eq(
    "chain: point order",
    HANDOVER_CHAIN.map((p) => p.id).join(","),
    [
      "pickup",
      "picker_to_centre",
      "centre_to_plant",
      "plant_sorting",
      "plant_stain",
      "plant_processing",
      "plant_finishing",
      "plant_qc",
      "plant_packing",
      "packer_to_outbound",
      "delivery",
    ].join(","),
  );
  eq("chain: ids unique", new Set(HANDOVER_CHAIN.map((p) => p.id)).size, 11);
  check("chain: all roles exist in STAFF_ROLES", chainRolesAreValid());
  check(
    "chain: methods — OTP only at the doorsteps",
    HANDOVER_CHAIN.every(
      (p) => (p.id === "pickup" || p.id === "delivery") === (p.method === "otp"),
    ),
  );
  check(
    "chain: otpKind matches the doorstep points",
    handoverPoint("pickup").otpKind === "pickup" &&
      handoverPoint("delivery").otpKind === "delivery" &&
      HANDOVER_CHAIN.filter((p) => p.method === "qr").every((p) => p.otpKind === null),
  );
  eq(
    "chain: plant stages are the 6 care stages, in order",
    HANDOVER_CHAIN.filter((p) => p.stage !== null)
      .map((p) => p.stage)
      .join("|"),
    services.careStages.map((s) => s.title).join("|"),
  );
  eq(
    "chain: flags vocabulary",
    HANDOVER_FLAGS.join(","),
    "missing_item,quantity_mismatch,duplicate,wrong_order,unauthorized,otp_retry",
  );

  // The status effects, walked in chain order from PICKUP_SCHEDULED,
  // must form the canonical lifecycle exactly.
  {
    let status = "PICKUP_SCHEDULED";
    const seen = [];
    let legal = true;
    for (const p of HANDOVER_CHAIN) {
      if (!p.statusEffect) continue;
      if (!canTransition(status, p.statusEffect)) legal = false;
      status = p.statusEffect;
      seen.push(status);
    }
    check("chain: every status effect is a legal order-flow move", legal);
    eq(
      "chain: effects walk the lifecycle to DELIVERED",
      seen.join(","),
      "PICKED_UP,RECEIVED,IN_PROCESS,READY,OUT_FOR_DELIVERY,DELIVERED",
    );
  }

  /* ---------------------------------------------------------------- */
  /* 2 · Next-point derivation                                         */
  /* ---------------------------------------------------------------- */
  {
    const done = new Set();
    eq("next: fresh order awaits pickup", nextHandoverPoint("PICKUP_SCHEDULED", done)?.id, "pickup");

    // Full walk: status follows each point's effect.
    let status = "PICKUP_SCHEDULED";
    const completed = new Set();
    for (const p of HANDOVER_CHAIN) {
      const next = nextHandoverPoint(status, completed);
      eq(`next: walk step ${p.id}`, next?.id, p.id);
      completed.add(p.id);
      if (p.statusEffect) status = p.statusEffect;
    }
    eq("next: after the full chain there is no next point", nextHandoverPoint(status, completed), null);
    const progress = chainProgress(status, completed);
    eq("progress: completed count", progress.completedCount, 11);
    eq("progress: chain complete", progress.chainComplete, true);
  }
  eq("next: DELIVERED is out of flow", nextHandoverPoint("DELIVERED", new Set()), null);
  eq("next: CANCELLED is out of flow", nextHandoverPoint("CANCELLED", new Set(["pickup"])), null);
  eq("next: PAYMENT_PENDING is out of flow", nextHandoverPoint("PAYMENT_PENDING", new Set()), null);
  eq("next: PAYMENT_FAILED is out of flow", nextHandoverPoint("PAYMENT_FAILED", new Set()), null);
  eq(
    "next: derivation ignores which points are done when status gates",
    nextHandoverPoint("IN_PROCESS", new Set(["pickup", "picker_to_centre", "centre_to_plant"]))?.id,
    "plant_sorting",
  );
  eq(
    "completedPointIds: from handover rows",
    [...completedPointIds([{ pointId: "pickup" }, { pointId: "plant_qc" }])].sort().join(","),
    "pickup,plant_qc",
  );

  /* ---------------------------------------------------------------- */
  /* 3 · OTP math                                                      */
  /* ---------------------------------------------------------------- */
  eq("otp: zero RNG gives 000000", generateOtp(() => 0), "000000");
  eq("otp: max RNG gives 999999", generateOtp(() => 999_999), "999999");
  eq("otp: leading zeros kept", generateOtp(() => 4210), "004210");
  check("otp: default RNG format", isOtpFormat(generateOtp()));
  check("otp: format rejects short", !isOtpFormat("12345"));
  check("otp: format rejects letters", !isOtpFormat("12a456"));
  eq("otp: max attempts is 5", OTP_MAX_ATTEMPTS, 5);
  check("otp: not locked at 4", !otpIsLocked(4));
  check("otp: locked at 5", otpIsLocked(5));

  eq(
    "verify: correct code passes",
    verifyOtp({ storedOtp: "123456", providedOtp: "123456", attempts: 0, alreadyUsed: false }).ok,
    true,
  );
  {
    const wrong = verifyOtp({ storedOtp: "123456", providedOtp: "000000", attempts: 0, alreadyUsed: false });
    eq("verify: wrong code fails", wrong.ok, false);
    eq("verify: wrong code is MISMATCH", wrong.code, "OTP_MISMATCH");
    eq("verify: wrong code increments attempts", wrong.attemptsAfter, 1);
    // Simulate the lockout: attempts 1..4 fail, the 5th failure lands
    // on 5, and from then on even the RIGHT code is locked out.
    let attempts = wrong.attemptsAfter;
    for (let i = 0; i < 4; i += 1) {
      attempts = verifyOtp({ storedOtp: "123456", providedOtp: "000000", attempts, alreadyUsed: false }).attemptsAfter;
    }
    eq("verify: 5 failures reach the lock threshold", attempts, 5);
    const locked = verifyOtp({ storedOtp: "123456", providedOtp: "123456", attempts, alreadyUsed: false });
    eq("verify: correct code still locked at 5", locked.ok, false);
    eq("verify: locked code", locked.code, "OTP_LOCKED");
    eq(
      "verify: 4 failures do NOT lock the correct code",
      verifyOtp({ storedOtp: "123456", providedOtp: "123456", attempts: 4, alreadyUsed: false }).ok,
      true,
    );
  }
  eq(
    "verify: no stored OTP",
    verifyOtp({ storedOtp: null, providedOtp: "123456", attempts: 0, alreadyUsed: false }).code,
    "OTP_NOT_SET",
  );
  eq(
    "verify: already used",
    verifyOtp({ storedOtp: "123456", providedOtp: "123456", attempts: 0, alreadyUsed: true }).code,
    "OTP_ALREADY_USED",
  );
  eq(
    "verify: malformed code counts as a mismatch",
    verifyOtp({ storedOtp: "123456", providedOtp: "abc", attempts: 2, alreadyUsed: false }).attemptsAfter,
    3,
  );

  /* ---------------------------------------------------------------- */
  /* 4 · QR payload                                                    */
  /* ---------------------------------------------------------------- */
  eq("qr: payload format", qrPayload("tok-123"), "zclean:order:tok-123");
  eq("qr: round-trip", parseQrPayload(qrPayload("tok-123")), "tok-123");
  eq("qr: bare token accepted", parseQrPayload("tok-123"), "tok-123");
  eq("qr: surrounding space trimmed", parseQrPayload("  zclean:order:tok-9  "), "tok-9");
  eq("qr: empty gives null", parseQrPayload(""), null);
  eq("qr: prefix-only gives null", parseQrPayload("zclean:order:"), null);
  eq("qr: null gives null", parseQrPayload(null), null);

  /* ---------------------------------------------------------------- */
  /* 5 · Quantities                                                    */
  /* ---------------------------------------------------------------- */
  eq("qty: pieces sum", orderItemCount([{ qty: 2 }, { qty: 3 }]), 5);
  eq("qty: fractional kg rounds", orderItemCount([{ qty: 2.5 }, { qty: 1.4 }]), 4);
  eq("qty: empty is 0", orderItemCount([]), 0);
  eq("flags: matching quantity", quantityFlags(5, 5).length, 0);
  eq("flags: mismatch flagged", quantityFlags(4, 5).join(","), "quantity_mismatch");
  eq("flags: over-count also flagged", quantityFlags(6, 5).join(","), "quantity_mismatch");

  /* ---------------------------------------------------------------- */
  /* 6 · Role matching                                                 */
  /* ---------------------------------------------------------------- */
  const emp = (roles, employmentStatus = "active") => ({
    id: "emp-1",
    fullName: "Test Employee",
    employmentStatus,
    roles,
  });
  eq("role: picker can receive pickup", employeeCanReceive(emp(["picker"]), handoverPoint("pickup")).ok, true);
  eq(
    "role: washerman cannot receive pickup",
    employeeCanReceive(emp(["washerman"]), handoverPoint("pickup")).code,
    "ROLE_MISMATCH",
  );
  eq(
    "role: inactive picker cannot receive",
    employeeCanReceive(emp(["picker"], "inactive"), handoverPoint("pickup")).code,
    "EMPLOYEE_INACTIVE",
  );
  eq(
    "role: transporter_outbound may also deliver",
    employeeCanReceive(emp(["transporter_outbound"]), handoverPoint("delivery")).ok,
    true,
  );
  eq(
    "role: delivery point lists both roles",
    receivingRoles(handoverPoint("delivery")).join(","),
    "delivery_staff,transporter_outbound",
  );
  eq(
    "role: multi-role employee matches on any role",
    employeeCanReceive(emp(["cashier", "packer"]), handoverPoint("plant_packing")).ok,
    true,
  );

  /* ---------------------------------------------------------------- */
  /* 7 · checkHandover scenarios                                       */
  /* ---------------------------------------------------------------- */
  const TOKEN = "qr-token-abc";
  const base = {
    orderStatus: "PICKUP_SCHEDULED",
    completedPointIds: new Set(),
    employee: emp(["picker"]),
    method: "otp",
    otpProvided: "123456",
    storedOtp: "123456",
    otpAlreadyUsed: false,
    otpAttempts: 0,
    qrProvided: null,
    storedQrToken: TOKEN,
    quantity: 5,
    expectedQuantity: 5,
  };
  const at = (pointId, over = {}) => ({
    ...base,
    point: handoverPoint(pointId),
    ...over,
  });

  {
    const happy = checkHandover(at("pickup"));
    eq("check: happy pickup passes", happy.ok, true);
    eq("check: happy pickup effect", happy.statusEffect, "PICKED_UP");
    eq("check: happy pickup no flags", happy.flags.length, 0);
  }
  eq(
    "check: duplicate point",
    checkHandover(at("pickup", { completedPointIds: new Set(["pickup"]) })).code,
    "DUPLICATE",
  );
  {
    const oos = checkHandover(at("centre_to_plant", { employee: emp(["plant_manager"]) }));
    eq("check: skipping ahead is out of sequence", oos.code, "OUT_OF_SEQUENCE");
    eq("check: out of sequence is 409", oos.httpStatus, 409);
  }
  eq(
    "check: no employee selected",
    checkHandover(at("pickup", { employee: null })).code,
    "EMPLOYEE_REQUIRED",
  );
  eq(
    "check: wrong role",
    checkHandover(at("pickup", { employee: emp(["packer"]) })).code,
    "ROLE_MISMATCH",
  );
  eq(
    "check: inactive employee is 409",
    checkHandover(at("pickup", { employee: emp(["picker"], "inactive") })).httpStatus,
    409,
  );
  eq(
    "check: QR method on an OTP point",
    checkHandover(at("pickup", { method: "qr", qrProvided: qrPayload(TOKEN) })).code,
    "METHOD_MISMATCH",
  );
  {
    const wrong = checkHandover(at("pickup", { otpProvided: "999999" }));
    eq("check: wrong OTP", wrong.code, "OTP_MISMATCH");
    eq("check: wrong OTP carries attemptsAfter", wrong.otpAttemptsAfter, 1);
    eq("check: wrong OTP is 422", wrong.httpStatus, 422);
  }
  {
    const locked = checkHandover(at("pickup", { otpAttempts: 5 }));
    eq("check: locked OTP", locked.code, "OTP_LOCKED");
    eq("check: locked OTP is 423", locked.httpStatus, 423);
  }
  eq(
    "check: OTP not set",
    checkHandover(at("pickup", { storedOtp: null })).code,
    "OTP_NOT_SET",
  );
  {
    // Advance past pickup: QR points.
    const donePickup = new Set(["pickup"]);
    const wrongQr = checkHandover(
      at("picker_to_centre", {
        orderStatus: "PICKED_UP",
        completedPointIds: donePickup,
        employee: emp(["collection_center"]),
        method: "qr",
        qrProvided: qrPayload("some-other-token"),
      }),
    );
    eq("check: wrong order's QR", wrongQr.code, "QR_MISMATCH");
    eq(
      "check: missing QR",
      checkHandover(
        at("picker_to_centre", {
          orderStatus: "PICKED_UP",
          completedPointIds: donePickup,
          employee: emp(["collection_center"]),
          method: "qr",
          qrProvided: "",
        }),
      ).code,
      "QR_REQUIRED",
    );
    const flagged = checkHandover(
      at("picker_to_centre", {
        orderStatus: "PICKED_UP",
        completedPointIds: donePickup,
        employee: emp(["collection_center"]),
        method: "qr",
        qrProvided: qrPayload(TOKEN),
        quantity: 3,
        expectedQuantity: 5,
      }),
    );
    eq("check: quantity mismatch still completes", flagged.ok, true);
    eq("check: quantity mismatch flag", flagged.flags.join(","), "quantity_mismatch");
    eq("check: chain point without effect", flagged.statusEffect, null);
    const missing = checkHandover(
      at("picker_to_centre", {
        orderStatus: "PICKED_UP",
        completedPointIds: donePickup,
        employee: emp(["collection_center"]),
        method: "qr",
        qrProvided: qrPayload(TOKEN),
        reportMissingItem: true,
      }),
    );
    eq("check: missing item flag leads", missing.flags[0], "missing_item");
  }
  {
    // Status-effect legality: plant_sorting must move RECEIVED ->
    // IN_PROCESS. If the order is still PICKUP_SCHEDULED with the
    // earlier points somehow recorded, the effect is illegal.
    const illegal = checkHandover(
      at("plant_sorting", {
        orderStatus: "PICKUP_SCHEDULED",
        completedPointIds: new Set(["pickup", "picker_to_centre", "centre_to_plant"]),
        employee: emp(["washerman"]),
        method: "qr",
        qrProvided: qrPayload(TOKEN),
      }),
    );
    eq("check: illegal status effect refused", illegal.code, "INVALID_TRANSITION");
    const legal = checkHandover(
      at("plant_sorting", {
        orderStatus: "RECEIVED",
        completedPointIds: new Set(["pickup", "picker_to_centre", "centre_to_plant"]),
        employee: emp(["washerman"]),
        method: "qr",
        qrProvided: qrPayload(TOKEN),
      }),
    );
    eq("check: legal plant entry passes", legal.ok, true);
    eq("check: plant entry effect", legal.statusEffect, "IN_PROCESS");
  }
  {
    // Delivery with COD semantics is the route's concern; the pure
    // check only gates the OTP + effect.
    const allButDelivery = new Set(HANDOVER_CHAIN.slice(0, 10).map((p) => p.id));
    const delivery = checkHandover(
      at("delivery", {
        orderStatus: "OUT_FOR_DELIVERY",
        completedPointIds: allButDelivery,
        employee: emp(["delivery_staff"]),
        storedOtp: "654321",
        otpProvided: "654321",
      }),
    );
    eq("check: delivery happy path", delivery.ok, true);
    eq("check: delivery effect", delivery.statusEffect, "DELIVERED");
  }
  eq(
    "check: terminal order awaits nothing",
    checkHandover(at("pickup", { orderStatus: "DELIVERED" })).code,
    "OUT_OF_SEQUENCE",
  );

  /* ---------------------------------------------------------------- */
  /* 8 · Request schemas                                               */
  /* ---------------------------------------------------------------- */
  eq(
    "schema: handover QR body ok",
    handoverCompleteSchema.safeParse({
      pointId: "picker_to_centre",
      toEmployeeId: "123e4567-e89b-12d3-a456-426614174000",
      method: "qr",
      qrToken: "zclean:order:tok",
      quantity: 5,
    }).success,
    true,
  );
  eq(
    "schema: handover OTP body ok",
    handoverCompleteSchema.safeParse({
      pointId: "pickup",
      toEmployeeId: "123e4567-e89b-12d3-a456-426614174000",
      method: "otp",
      otp: "123456",
    }).success,
    true,
  );
  eq(
    "schema: bad OTP format rejected",
    handoverCompleteSchema.safeParse({
      pointId: "pickup",
      toEmployeeId: "123e4567-e89b-12d3-a456-426614174000",
      method: "otp",
      otp: "12345",
    }).success,
    false,
  );
  eq(
    "schema: bad employee id rejected",
    handoverCompleteSchema.safeParse({
      pointId: "pickup",
      toEmployeeId: "not-a-uuid",
      method: "otp",
      otp: "123456",
    }).success,
    false,
  );
  eq(
    "schema: fractional quantity rejected",
    handoverCompleteSchema.safeParse({
      pointId: "pickup",
      toEmployeeId: "123e4567-e89b-12d3-a456-426614174000",
      method: "otp",
      otp: "123456",
      quantity: 2.5,
    }).success,
    false,
  );
  eq("schema: regenerate pickup ok", regenerateOtpSchema.safeParse({ which: "pickup" }).success, true);
  eq("schema: regenerate bad target rejected", regenerateOtpSchema.safeParse({ which: "both" }).success, false);

  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length > 0) {
    console.log(`Failing: ${failures.join("; ")}`);
    process.exitCode = 1;
  }
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
