/**
 * Tracking tests (Staff Web App phase) — plain node, no test
 * framework. Compiles src/lib/tracking.ts (which pulls in handovers +
 * org), src/lib/roles.ts and src/lib/validation.ts with the project's
 * own TypeScript into a scratch dir INSIDE the project — so compiled
 * output can resolve zod from the project's node_modules — then
 * asserts:
 *   1. coordinate + accuracy validation,
 *   2. haversine distance + ETA maths (Phase D consumes both),
 *   3. leg ↔ handover-point mapping and receiving roles,
 *   4. assignment eligibility rules (canAssignEmployee),
 *   5. the ping authorization predicate (canPingAssignment) — the
 *      rule the service-role insert stands behind,
 *   6. the client send-throttle (shouldSendPing),
 *   7. Nominatim query building + response parsing,
 *   8. the 'staff' role invariants (exists, but NEVER an admin tier),
 *   9. the zod request schemas for assignments / pings / staff
 *      handovers.
 * Run: `npm run test:tracking`. Exits non-zero on failure.
 */
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtempSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const scratch = mkdtempSync(join(projectRoot, ".test-scratch-tracking-"));

try {
  const tscBin = join(projectRoot, "node_modules", ".bin", "tsc");
  execFileSync(
    tscBin,
    [
      "src/lib/tracking.ts",
      "src/lib/roles.ts",
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
  const tracking = require(join(scratch, "tracking.js"));
  const roles = require(join(scratch, "roles.js"));
  const validation = require(join(scratch, "validation.js"));
  const {
    isTrackingLeg,
    legHandoverPointId,
    legForHandoverPointId,
    legReceivingRoles,
    isAssignmentActive,
    canAssignEmployee,
    canPingAssignment,
    isValidCoordinate,
    isValidAccuracy,
    haversineMeters,
    estimateEtaSeconds,
    shouldSendPing,
    buildGeocodeQuery,
    parseGeocodeResponse,
    PING_MIN_INTERVAL_MS,
    PING_MIN_DISTANCE_M,
  } = tracking;

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
    check(name, actual === expected, `(expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`);
  }
  function near(name, actual, expected, tolerance) {
    check(
      name,
      typeof actual === "number" && Math.abs(actual - expected) <= tolerance,
      `(expected ~${expected}±${tolerance}, got ${actual})`,
    );
  }

  // 1 · Coordinates: real points pass, the globe's edges are the
  //     limit, and every non-number is refused.
  const BOKARO = { lat: 23.6693, lng: 86.1511 };
  eq("coords: Bokaro plant point valid", isValidCoordinate(BOKARO.lat, BOKARO.lng), true);
  eq("coords: equator/prime meridian valid", isValidCoordinate(0, 0), true);
  eq("coords: +90/+180 edge valid", isValidCoordinate(90, 180), true);
  eq("coords: -90/-180 edge valid", isValidCoordinate(-90, -180), true);
  eq("coords: lat beyond pole refused", isValidCoordinate(90.0001, 0), false);
  eq("coords: lng beyond antimeridian refused", isValidCoordinate(0, -180.5), false);
  eq("coords: NaN refused", isValidCoordinate(NaN, 86), false);
  eq("coords: Infinity refused", isValidCoordinate(23, Infinity), false);
  eq("coords: string refused", isValidCoordinate("23.66", 86.15), false);
  eq("coords: null refused", isValidCoordinate(null, 86.15), false);
  eq("coords: undefined refused", isValidCoordinate(23.66, undefined), false);

  // Accuracy: absent is fine; absurd values are not.
  eq("accuracy: null ok", isValidAccuracy(null), true);
  eq("accuracy: undefined ok", isValidAccuracy(undefined), true);
  eq("accuracy: 12m ok", isValidAccuracy(12), true);
  eq("accuracy: 10km fix ok", isValidAccuracy(10_000), true);
  eq("accuracy: 100km boundary ok", isValidAccuracy(100_000), true);
  eq("accuracy: beyond 100km refused as absurd", isValidAccuracy(100_001), false);
  eq("accuracy: negative refused", isValidAccuracy(-1), false);
  eq("accuracy: NaN refused", isValidAccuracy(NaN), false);

  // 2 · Haversine + ETA.
  eq("haversine: same point is zero", haversineMeters(BOKARO, BOKARO), 0);
  near("haversine: 1° of longitude at the equator", haversineMeters({ lat: 0, lng: 0 }, { lat: 0, lng: 1 }), 111_195, 30);
  near("haversine: 1° of latitude", haversineMeters({ lat: 10, lng: 40 }, { lat: 11, lng: 40 }), 111_195, 30);
  near("haversine: antipodes ≈ half circumference", haversineMeters({ lat: 0, lng: 0 }, { lat: 0, lng: 180 }), 20_015_087, 60);
  {
    // Balidih → Chas, a real in-city hop of roughly 4–5 km.
    const d = haversineMeters(BOKARO, { lat: 23.6348, lng: 86.1698 });
    check("haversine: Balidih→Chas in a sane band", d > 3_500 && d < 5_500, `(got ${Math.round(d)}m)`);
  }
  eq("eta: zero distance is zero", estimateEtaSeconds(0), 0);
  eq("eta: negative distance is zero", estimateEtaSeconds(-50), 0);
  // 1 km × 1.35 road factor at 20 km/h (5.5556 m/s) = 243s.
  eq("eta: default speed + road factor", estimateEtaSeconds(1_000), 243);
  eq("eta: NaN distance is zero", estimateEtaSeconds(NaN), 0);

  // 3 · Legs map onto the handover chain, both directions.
  eq("leg: pickup is a tracking leg", isTrackingLeg("pickup"), true);
  eq("leg: delivery is a tracking leg", isTrackingLeg("delivery"), true);
  eq("leg: plant_in is not", isTrackingLeg("plant_in"), false);
  eq("leg: garbage is not", isTrackingLeg("wibble"), false);
  eq("leg→point: pickup", legHandoverPointId("pickup"), "pickup");
  eq("leg→point: delivery", legHandoverPointId("delivery"), "delivery");
  // legHandoverPointId is typed to TrackingLeg only; the runtime
  // guard for untrusted values is isTrackingLeg (asserted above).
  eq("point→leg: pickup", legForHandoverPointId("pickup"), "pickup");
  eq("point→leg: delivery", legForHandoverPointId("delivery"), "delivery");
  eq("point→leg: plant point has no leg", legForHandoverPointId("plant_in"), null);
  eq("roles: pickup leg needs a picker", JSON.stringify(legReceivingRoles("pickup")), JSON.stringify(["picker"]));
  {
    const deliveryRoles = legReceivingRoles("delivery");
    check(
      "roles: delivery leg takes delivery_staff or transporter_outbound",
      deliveryRoles.includes("delivery_staff") && deliveryRoles.includes("transporter_outbound"),
      `(got ${JSON.stringify(deliveryRoles)})`,
    );
  }
  eq("roles: unknown leg has none", legReceivingRoles("plant_in").length, 0);

  // 4 · Assignment eligibility.
  const activePicker = { leg: "pickup", employmentStatus: "active", roles: ["picker"] };
  eq("assign: active picker to pickup ok", canAssignEmployee(activePicker).ok, true);
  // The status is the employees.employment_status DB value, always
  // the lowercase enum the employee schemas write — exact match.
  eq("assign: non-enum status refused as inactive", canAssignEmployee({ ...activePicker, employmentStatus: "ACTIVE" }).code, "EMPLOYEE_INACTIVE");
  eq("assign: inactive refused", canAssignEmployee({ ...activePicker, employmentStatus: "inactive" }).code, "EMPLOYEE_INACTIVE");
  eq("assign: wrong role refused", canAssignEmployee({ leg: "pickup", employmentStatus: "active", roles: ["customer_care"] }).code, "ROLE_MISMATCH");
  eq("assign: no roles refused", canAssignEmployee({ leg: "pickup", employmentStatus: "active", roles: [] }).code, "ROLE_MISMATCH");
  eq("assign: delivery_staff to delivery ok", canAssignEmployee({ leg: "delivery", employmentStatus: "active", roles: ["delivery_staff"] }).ok, true);
  eq("assign: transporter_outbound to delivery ok", canAssignEmployee({ leg: "delivery", employmentStatus: "active", roles: ["transporter_outbound"] }).ok, true);
  eq("assign: picker cannot take delivery", canAssignEmployee({ leg: "delivery", employmentStatus: "active", roles: ["picker"] }).code, "ROLE_MISMATCH");
  eq("assign: unknown leg refused", canAssignEmployee({ leg: "plant_in", employmentStatus: "active", roles: ["picker"] }).code, "INVALID_LEG");
  eq("assign: unknown role ids ignored safely", canAssignEmployee({ leg: "pickup", employmentStatus: "active", roles: ["wizard", "picker"] }).ok, true);

  // 5 · The ping predicate — the heart of tracking authorization.
  const mine = { id: "a1", orderId: "o1", leg: "pickup", employeeId: "emp-1", completedAt: null };
  eq("active: open assignment is active", isAssignmentActive(mine), true);
  eq("active: completed assignment is not", isAssignmentActive({ ...mine, completedAt: "2026-11-05T10:00:00Z" }), false);
  eq("ping: own active assignment ok", canPingAssignment({ assignment: mine, employeeIdForUser: "emp-1" }).ok, true);
  eq("ping: missing assignment", canPingAssignment({ assignment: null, employeeIdForUser: "emp-1" }).code, "ASSIGNMENT_NOT_FOUND");
  eq("ping: unlinked account", canPingAssignment({ assignment: mine, employeeIdForUser: null }).code, "NO_EMPLOYEE_LINK");
  eq("ping: undefined link counts as unlinked", canPingAssignment({ assignment: mine, employeeIdForUser: undefined }).code, "NO_EMPLOYEE_LINK");
  eq("ping: another rider's assignment", canPingAssignment({ assignment: mine, employeeIdForUser: "emp-2" }).code, "NOT_YOUR_ASSIGNMENT");
  eq(
    "ping: completed leg refuses (even the owner)",
    canPingAssignment({ assignment: { ...mine, completedAt: "2026-11-05T10:00:00Z" }, employeeIdForUser: "emp-1" }).code,
    "ASSIGNMENT_COMPLETED",
  );
  eq(
    "ping: not-found is reported before ownership",
    canPingAssignment({ assignment: null, employeeIdForUser: null }).code,
    "ASSIGNMENT_NOT_FOUND",
  );

  // 6 · The send throttle.
  eq("throttle: interval constant is 15s", PING_MIN_INTERVAL_MS, 15_000);
  eq("throttle: distance constant is 25m", PING_MIN_DISTANCE_M, 25);
  {
    const t0 = 1_000_000;
    eq("throttle: first fix sends", shouldSendPing(null, { atMs: t0, ...BOKARO }), true);

    const last = { atMs: t0, ...BOKARO };
    eq("throttle: 10s later, same spot — held", shouldSendPing(last, { atMs: t0 + 10_000, ...BOKARO }), false);
    eq("throttle: 20s later, same spot — held (distance gate)", shouldSendPing(last, { atMs: t0 + 20_000, ...BOKARO }), false);
    const moved = { atMs: t0 + 20_000, lat: BOKARO.lat + 0.001, lng: BOKARO.lng }; // ≈111m north
    eq("throttle: 20s later, moved 111m — sends", shouldSendPing(last, moved), true);
    eq("throttle: 3 minutes later, same spot — heartbeat sends", shouldSendPing(last, { atMs: t0 + 180_000, ...BOKARO }), true);
    const smallMove = { atMs: t0 + 20_000, lat: BOKARO.lat + 0.0001, lng: BOKARO.lng }; // ≈11m
    eq("throttle: 20s later, moved only 11m — held", shouldSendPing(last, smallMove), false);
    eq("throttle: 10s later, moved far — still held (interval gate first)", shouldSendPing(last, { atMs: t0 + 10_000, lat: BOKARO.lat + 0.01, lng: BOKARO.lng }), false);
  }

  // 7 · Geocoding helpers.
  {
    const q = buildGeocodeQuery({ line: "House 12, Road 3", area: "Sector 4", city: "Bokaro Steel City", pincode: "827004" });
    check(
      "geocode query: carries line, area, pincode and country",
      q.includes("House 12, Road 3") && q.includes("Sector 4") && q.includes("827004") && q.endsWith("India"),
      `(got "${q}")`,
    );
    const sparse = buildGeocodeQuery({ line: "", area: "  ", pincode: "827004" });
    eq("geocode query: blanks dropped", sparse, "827004, India");
  }
  {
    const hit = parseGeocodeResponse([{ lat: "23.6693", lon: "86.1511" }]);
    eq("geocode parse: string hit lat", hit?.lat, 23.6693);
    eq("geocode parse: string hit lng", hit?.lng, 86.1511);
    const numeric = parseGeocodeResponse([{ lat: 23.1, lon: 86.2 }]);
    eq("geocode parse: numeric hit", numeric?.lat, 23.1);
    eq("geocode parse: empty array is null", parseGeocodeResponse([]), null);
    eq("geocode parse: non-array is null", parseGeocodeResponse({ lat: 1 }), null);
    eq("geocode parse: garbage entry is null", parseGeocodeResponse([{ lat: "north", lon: "east" }]), null);
    eq("geocode parse: out-of-range is null", parseGeocodeResponse([{ lat: "123", lon: "86" }]), null);
    eq("geocode parse: null body is null", parseGeocodeResponse(null), null);
  }

  // 8 · The staff role exists but is NEVER an admin tier — the
  //     invariant schema_v10's is_admin() note depends on.
  check("roles: 'staff' is a known user role", roles.USER_ROLES.includes("staff"));
  eq("roles: staff is not an admin tier", roles.isAdminTier("staff"), false);
  eq("roles: staff level is the customer level", roles.ROLE_LEVEL.staff, 0);
  eq("roles: staff is not disabled-flagged", roles.isAccountDisabled({ role: "staff", disabled: false }), false);

  // 9 · Request schemas.
  const UUID = "3f6b8f2e-9f6d-4c1c-9c5f-2f6b8f2e9f6d";
  eq("schema: assignment create ok", validation.assignmentCreateSchema.safeParse({ leg: "pickup", employeeId: UUID }).success, true);
  eq("schema: assignment create rejects plant leg", validation.assignmentCreateSchema.safeParse({ leg: "plant_in", employeeId: UUID }).success, false);
  eq("schema: assignment create rejects non-uuid", validation.assignmentCreateSchema.safeParse({ leg: "pickup", employeeId: "emp-1" }).success, false);
  eq("schema: assignment update reassign ok", validation.assignmentUpdateSchema.safeParse({ assignmentId: UUID, employeeId: UUID }).success, true);
  eq("schema: assignment update complete ok", validation.assignmentUpdateSchema.safeParse({ assignmentId: UUID, action: "complete" }).success, true);
  eq("schema: assignment update needs one action", validation.assignmentUpdateSchema.safeParse({ assignmentId: UUID }).success, false);
  eq("schema: ping ok", validation.trackingPingSchema.safeParse({ assignmentId: UUID, lat: 23.66, lng: 86.15 }).success, true);
  eq("schema: ping with accuracy ok", validation.trackingPingSchema.safeParse({ assignmentId: UUID, lat: 23.66, lng: 86.15, accuracyM: 18 }).success, true);
  eq("schema: ping rejects impossible latitude", validation.trackingPingSchema.safeParse({ assignmentId: UUID, lat: 91, lng: 86.15 }).success, false);
  eq("schema: staff handover ok", validation.staffHandoverSchema.safeParse({ otp: "123456" }).success, true);
  eq("schema: staff handover rejects short code", validation.staffHandoverSchema.safeParse({ otp: "12345" }).success, false);
  eq("schema: staff handover rejects long code", validation.staffHandoverSchema.safeParse({ otp: "1234567" }).success, false);
  eq(
    "schema: staff handover cod flag is optional (route coerces to false)",
    validation.staffHandoverSchema.parse({ otp: "123456" }).codCollected,
    undefined,
  );
  eq(
    "schema: staff handover cod flag true parses",
    validation.staffHandoverSchema.parse({ otp: "123456", codCollected: true }).codCollected,
    true,
  );
  eq("schema: branch pin accepted", validation.branchCreateSchema.safeParse({ name: "Plant", type: "plant", lat: 23.66, lng: 86.15 }).success, true);
  eq("schema: branch pin optional", validation.branchCreateSchema.safeParse({ name: "Plant", type: "plant" }).success, true);
  eq("schema: branch pin rejects bad latitude", validation.branchCreateSchema.safeParse({ name: "Plant", type: "plant", lat: 123, lng: 86 }).success, false);

  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length > 0) {
    console.error(`Failing: ${failures.join("; ")}`);
    process.exit(1);
  }
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
