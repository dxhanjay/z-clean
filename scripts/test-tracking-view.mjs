/**
 * Tracking VIEW tests (Phase D — customer live map). Plain node, no
 * test framework, same pattern as scripts/test-tracking.mjs:
 * compiles src/lib/tracking-view.ts (which pulls in order-flow +
 * tracking → handovers → org) with the project's own TypeScript
 * into a scratch dir inside the project, then asserts:
 *   1. the card visibility state machine (hidden/waiting/live/stale),
 *   2. position merging (newer recordedAt wins, either source),
 *   3. realtime row parsing (numeric strings, garbage rejection),
 *   4. chip derivation + formatting (distance/ETA/last-updated hide
 *      rules — a chip exists only when its inputs are real),
 *   5. OSRM URL + response parsing (NoRoute hides the ETA),
 *   6. the 12-stage presentation timeline derivation.
 * The Leaflet rendering itself is NOT unit-tested (DOM/canvas) —
 * only the pure decisions behind it are.
 * Run: `npm run test:tracking-view`. Exits non-zero on failure.
 */
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtempSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const scratch = mkdtempSync(join(projectRoot, ".test-scratch-tracking-view-"));

try {
  const tscBin = join(projectRoot, "node_modules", ".bin", "tsc");
  execFileSync(
    tscBin,
    [
      "src/lib/tracking-view.ts",
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
  const view = require(join(scratch, "tracking-view.js"));
  const {
    TRACKING_POLL_MS,
    TRACKING_STALE_AFTER_MS,
    activeLegForStatus,
    trackingCardState,
    mergeLatestPosition,
    parseRealtimePosition,
    formatDistanceMeters,
    formatEtaSeconds,
    formatLastUpdated,
    deriveTrackingChips,
    buildOsrmRouteUrl,
    parseOsrmRoute,
    presentationStages,
  } = view;

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

  const NOW = Date.parse("2026-11-05T10:00:00.000Z");
  const iso = (msAgo) => new Date(NOW - msAgo).toISOString();
  const RIDER = { lat: 23.6693, lng: 86.1511 }; // Bokaro plant area
  const HOME = { lat: 23.6348, lng: 86.1698 }; // Chas — ~4.3 km away
  const pickupActive = { leg: "pickup", state: "active", riderFirstName: "Ramesh", assignedAt: iso(600_000), completedAt: null };
  const deliveryActive = { leg: "delivery", state: "active", riderFirstName: "Suresh", assignedAt: iso(300_000), completedAt: null };
  const pos = (msAgo, extra = {}) => ({ ...RIDER, accuracyM: 14, recordedAt: iso(msAgo), ...extra });

  // 0 · Constants are the contract the card was specified against.
  eq("const: poll cadence is 20s", TRACKING_POLL_MS, 20_000);
  eq("const: stale threshold is 3 min", TRACKING_STALE_AFTER_MS, 180_000);

  // 1 · Leg context: assignment + status must agree.
  eq("leg: pickup active + PLACED", activeLegForStatus("PLACED", pickupActive), "pickup");
  eq("leg: pickup active + PICKUP_SCHEDULED", activeLegForStatus("PICKUP_SCHEDULED", pickupActive), "pickup");
  eq("leg: pickup active + PICKED_UP is over", activeLegForStatus("PICKED_UP", pickupActive), null);
  eq("leg: delivery active + OUT_FOR_DELIVERY", activeLegForStatus("OUT_FOR_DELIVERY", deliveryActive), "delivery");
  eq("leg: delivery active + READY is not out yet", activeLegForStatus("READY", deliveryActive), null);
  eq("leg: pickup assignment on delivery status", activeLegForStatus("OUT_FOR_DELIVERY", pickupActive), null);
  eq("leg: completed assignment never live", activeLegForStatus("PICKUP_SCHEDULED", { ...pickupActive, state: "completed", completedAt: iso(60_000) }), null);
  eq("leg: no assignment", activeLegForStatus("PICKUP_SCHEDULED", null), null);
  eq("leg: unknown leg string", activeLegForStatus("PICKUP_SCHEDULED", { ...pickupActive, leg: "plant" }), null);

  // 2 · Card states.
  eq("card: no rider assigned → hidden", trackingCardState({ status: "PICKUP_SCHEDULED", assignment: null, latestPosition: null, nowMs: NOW }).kind, "hidden");
  eq("card: position without a live leg → hidden", trackingCardState({ status: "IN_PROCESS", assignment: null, latestPosition: pos(10_000), nowMs: NOW }).kind, "hidden");
  {
    const s = trackingCardState({ status: "PICKUP_SCHEDULED", assignment: pickupActive, latestPosition: null, nowMs: NOW });
    eq("card: assigned, no ping yet → waiting", s.kind, "waiting");
    eq("card: waiting carries the rider name", s.riderFirstName, "Ramesh");
    eq("card: waiting carries the leg", s.leg, "pickup");
    eq("card: waiting has no position", s.position, null);
  }
  eq("card: fresh ping → live", trackingCardState({ status: "PICKUP_SCHEDULED", assignment: pickupActive, latestPosition: pos(30_000), nowMs: NOW }).kind, "live");
  eq("card: ping at exactly 3 min → live", trackingCardState({ status: "PICKUP_SCHEDULED", assignment: pickupActive, latestPosition: pos(180_000), nowMs: NOW }).kind, "live");
  eq("card: ping at 3 min + 1 ms → stale", trackingCardState({ status: "PICKUP_SCHEDULED", assignment: pickupActive, latestPosition: pos(180_001), nowMs: NOW }).kind, "stale");
  eq("card: hour-old ping → stale", trackingCardState({ status: "OUT_FOR_DELIVERY", assignment: deliveryActive, latestPosition: pos(3_600_000), nowMs: NOW }).kind, "stale");
  eq("card: clock-skew future ping → live", trackingCardState({ status: "PICKUP_SCHEDULED", assignment: pickupActive, latestPosition: pos(-60_000), nowMs: NOW }).kind, "live");
  eq("card: unparseable timestamp → stale, never live", trackingCardState({ status: "PICKUP_SCHEDULED", assignment: pickupActive, latestPosition: pos(0, { recordedAt: "not-a-date" }), nowMs: NOW }).kind, "stale");
  {
    const s = trackingCardState({ status: "OUT_FOR_DELIVERY", assignment: deliveryActive, latestPosition: pos(5_000), nowMs: NOW });
    eq("card: delivery leg live", s.kind, "live");
    eq("card: delivery leg label", s.leg, "delivery");
    eq("card: lastPingAt mirrors the position", s.lastPingAt, iso(5_000));
  }

  // 3 · Merging: whichever source, the newer recordedAt wins.
  eq("merge: both null", mergeLatestPosition(null, null), null);
  eq("merge: incoming only", mergeLatestPosition(null, pos(5_000))?.recordedAt, iso(5_000));
  eq("merge: current only", mergeLatestPosition(pos(5_000), null)?.recordedAt, iso(5_000));
  eq("merge: newer poll beats older realtime", mergeLatestPosition(pos(60_000), pos(5_000))?.recordedAt, iso(5_000));
  eq("merge: older poll does NOT rewind realtime", mergeLatestPosition(pos(5_000), pos(60_000))?.recordedAt, iso(5_000));
  eq("merge: equal timestamps keep the incoming row", mergeLatestPosition(pos(5_000, { accuracyM: 30 }), pos(5_000, { accuracyM: 9 }))?.accuracyM, 9);
  eq("merge: garbage incoming ignored", mergeLatestPosition(pos(5_000), { ...RIDER, accuracyM: null, recordedAt: "junk" })?.recordedAt, iso(5_000));
  eq("merge: garbage current replaced by valid incoming", mergeLatestPosition({ ...RIDER, accuracyM: null, recordedAt: "junk" }, pos(9_999))?.recordedAt, iso(9_999));

  // 4 · Realtime rows: PostgREST numerics may be strings.
  {
    const p = parseRealtimePosition({ lat: "23.6693", lng: "86.1511", accuracy_m: "18", recorded_at: iso(1_000), order_id: "o1" });
    eq("rt: string lat parsed", p?.lat, 23.6693);
    eq("rt: string lng parsed", p?.lng, 86.1511);
    eq("rt: string accuracy parsed", p?.accuracyM, 18);
    eq("rt: recorded_at carried", p?.recordedAt, iso(1_000));
  }
  eq("rt: numeric row ok", parseRealtimePosition({ lat: 23.1, lng: 86.2, accuracy_m: null, recorded_at: iso(0) })?.accuracyM, null);
  eq("rt: impossible latitude refused", parseRealtimePosition({ lat: 123, lng: 86, recorded_at: iso(0) }), null);
  eq("rt: missing timestamp refused", parseRealtimePosition({ lat: 23, lng: 86 }), null);
  eq("rt: bad timestamp refused", parseRealtimePosition({ lat: 23, lng: 86, recorded_at: "soon" }), null);
  eq("rt: null row refused", parseRealtimePosition(null), null);
  eq("rt: string garbage refused", parseRealtimePosition({ lat: "north", lng: "east", recorded_at: iso(0) }), null);

  // 5 · Chips: real inputs or no chip.
  {
    const chips = deriveTrackingChips({ rider: RIDER, destination: HOME, osrmDurationSec: 1080, lastPingAt: iso(42_000), nowMs: NOW });
    check("chips: distance is the real haversine (4–5 km band)", chips.distanceMeters > 3_500 && chips.distanceMeters < 5_500, `(got ${chips.distanceMeters})`);
    check("chips: distance label is km-formatted", /^\d+(\.\d+)? km$/.test(chips.distanceLabel ?? ""), `(got ${chips.distanceLabel})`);
    eq("chips: ETA seconds pass through", chips.etaSeconds, 1080);
    eq("chips: ETA label", chips.etaLabel, "18 min");
    eq("chips: last updated seconds", chips.lastUpdatedSec, 42);
    eq("chips: last updated label", chips.lastUpdatedLabel, "42 sec ago");
  }
  eq("chips: no destination → no distance", deriveTrackingChips({ rider: RIDER, destination: null, osrmDurationSec: 600, lastPingAt: iso(0), nowMs: NOW }).distanceMeters, null);
  eq("chips: no destination → no ETA either", deriveTrackingChips({ rider: RIDER, destination: null, osrmDurationSec: 600, lastPingAt: iso(0), nowMs: NOW }).etaSeconds, null);
  eq("chips: no rider → no distance", deriveTrackingChips({ rider: null, destination: HOME, osrmDurationSec: 600, lastPingAt: null, nowMs: NOW }).distanceLabel, null);
  eq("chips: OSRM failure (null) hides ETA only", deriveTrackingChips({ rider: RIDER, destination: HOME, osrmDurationSec: null, lastPingAt: iso(0), nowMs: NOW }).etaSeconds, null);
  check("chips: distance survives an OSRM failure", deriveTrackingChips({ rider: RIDER, destination: HOME, osrmDurationSec: null, lastPingAt: iso(0), nowMs: NOW }).distanceMeters > 0);
  eq("chips: OSRM zero duration hides ETA (rider at the door)", deriveTrackingChips({ rider: RIDER, destination: HOME, osrmDurationSec: 0, lastPingAt: iso(0), nowMs: NOW }).etaSeconds, null);
  eq("chips: OSRM negative duration hides ETA", deriveTrackingChips({ rider: RIDER, destination: HOME, osrmDurationSec: -30, lastPingAt: iso(0), nowMs: NOW }).etaSeconds, null);
  eq("chips: no ping → no last-updated", deriveTrackingChips({ rider: null, destination: null, osrmDurationSec: null, lastPingAt: null, nowMs: NOW }).lastUpdatedLabel, null);
  eq("chips: future ping clamps to just now", deriveTrackingChips({ rider: null, destination: null, osrmDurationSec: null, lastPingAt: iso(-30_000), nowMs: NOW }).lastUpdatedLabel, "just now");

  // Formatting edges.
  eq("fmt distance: 0 m", formatDistanceMeters(0), "0 m");
  eq("fmt distance: 850 m", formatDistanceMeters(850), "850 m");
  eq("fmt distance: 1 km exact", formatDistanceMeters(1000), "1 km");
  eq("fmt distance: 1.25 km", formatDistanceMeters(1250), "1.3 km");
  eq("fmt distance: 12.34 km rounds whole", formatDistanceMeters(12_340), "12 km");
  eq("fmt eta: 30 sec shows 1 min (never 0)", formatEtaSeconds(30), "1 min");
  eq("fmt eta: 59 min", formatEtaSeconds(59 * 60), "59 min");
  eq("fmt eta: 65 min", formatEtaSeconds(65 * 60), "1 hr 5 min");
  eq("fmt eta: 2 hr exact", formatEtaSeconds(120 * 60), "2 hr");
  eq("fmt updated: 3 sec", formatLastUpdated(3), "just now");
  eq("fmt updated: 42 sec", formatLastUpdated(42), "42 sec ago");
  eq("fmt updated: 5 min", formatLastUpdated(300), "5 min ago");
  eq("fmt updated: 2 hr", formatLastUpdated(7200), "2 hr ago");

  // 6 · OSRM shaping.
  {
    const url = buildOsrmRouteUrl(RIDER, HOME);
    check("osrm url: lng,lat order for both points", url.includes("86.1511,23.6693;86.1698,23.6348"), `(got ${url})`);
    check("osrm url: geojson geometry requested", url.includes("geometries=geojson"));
  }
  {
    const parsed = parseOsrmRoute({
      code: "Ok",
      routes: [{ duration: 1080.4, geometry: { coordinates: [[86.1511, 23.6693], [86.16, 23.65], [86.1698, 23.6348]] } }],
    });
    eq("osrm: duration parsed", parsed?.durationSec, 1080.4);
    eq("osrm: geometry converted to lat/lng", JSON.stringify(parsed?.geometry[1]), JSON.stringify({ lat: 23.65, lng: 86.16 }));
    eq("osrm: geometry length", parsed?.geometry.length, 3);
  }
  eq("osrm: NoRoute → null (ETA hides)", parseOsrmRoute({ code: "NoRoute", routes: [] }), null);
  eq("osrm: empty routes → null", parseOsrmRoute({ code: "Ok", routes: [] }), null);
  eq("osrm: garbage body → null", parseOsrmRoute("error"), null);
  eq("osrm: missing duration → null", parseOsrmRoute({ code: "Ok", routes: [{ geometry: { coordinates: [] } }] }), null);
  {
    const parsed = parseOsrmRoute({ code: "Ok", routes: [{ duration: 300, geometry: { coordinates: [[999, 999]] } }] });
    eq("osrm: bad geometry keeps the duration", parsed?.durationSec, 300);
    eq("osrm: bad geometry yields no line", parsed?.geometry.length, 0);
  }

  // 7 · The 12-stage presentation timeline.
  const LABELS = ["Order placed", "Pickup scheduled", "Rider on the way", "Picked up", "Received at facility", "Washing", "Drying", "Ironing", "Quality check", "Packed", "Out for delivery", "Delivered"];
  const stageById = (stages, id) => stages.find((s) => s.id === id);
  {
    const stages = presentationStages({ status: "PLACED", createdAt: iso(900_000) });
    eq("stages: exactly 12", stages.length, 12);
    eq("stages: labels in the specified order", JSON.stringify(stages.map((s) => s.label)), JSON.stringify(LABELS));
    eq("stages: PLACED → placed is current", stageById(stages, "placed").state, "current");
    eq("stages: PLACED → placed time is the creation time", stageById(stages, "placed").at, iso(900_000));
    eq("stages: PLACED → rider upcoming", stageById(stages, "rider_on_the_way").state, "upcoming");
    eq("stages: PLACED → delivered upcoming", stageById(stages, "delivered").state, "upcoming");
  }
  {
    const stages = presentationStages({ status: "PICKUP_SCHEDULED", statusTimes: { PICKUP_SCHEDULED: iso(800_000) } });
    eq("stages: scheduled, no rider → scheduled current", stageById(stages, "pickup_scheduled").state, "current");
    eq("stages: scheduled, no rider → placed done", stageById(stages, "placed").state, "done");
    eq("stages: scheduled, no rider → rider stage stays upcoming", stageById(stages, "rider_on_the_way").state, "upcoming");
  }
  {
    const stages = presentationStages({
      status: "PICKUP_SCHEDULED",
      pickupRiderActive: true,
      pickupAssignedAt: iso(700_000),
      statusTimes: { PICKUP_SCHEDULED: iso(800_000) },
    });
    eq("stages: rider active → rider stage current", stageById(stages, "rider_on_the_way").state, "current");
    eq("stages: rider active → scheduled reads done", stageById(stages, "pickup_scheduled").state, "done");
    eq("stages: rider stage time is the assignment time", stageById(stages, "rider_on_the_way").at, iso(700_000));
    eq("stages: rider active → picked up still upcoming", stageById(stages, "picked_up").state, "upcoming");
  }
  {
    const stages = presentationStages({
      status: "PICKED_UP",
      milestoneTimes: { pickup: iso(500_000) },
      statusTimes: { PICKED_UP: iso(500_000) },
      statusNotes: { PICKED_UP: "3 items collected" },
    });
    eq("stages: picked up → rider stage done", stageById(stages, "rider_on_the_way").state, "done");
    eq("stages: picked up → rider time is the pickup milestone", stageById(stages, "rider_on_the_way").at, iso(500_000));
    eq("stages: picked up → picked_up current", stageById(stages, "picked_up").state, "current");
    eq("stages: canonical note rides along", stageById(stages, "picked_up").note, "3 items collected");
    eq("stages: care stages carry no notes", stageById(stages, "washing").note, null);
  }
  {
    const stages = presentationStages({ status: "IN_PROCESS" });
    eq("stages: in process, no milestones → washing current", stageById(stages, "washing").state, "current");
    eq("stages: in process → received done", stageById(stages, "received").state, "done");
    eq("stages: in process → drying upcoming (never current alone)", stageById(stages, "drying").state, "upcoming");
    eq("stages: in process → ironing upcoming", stageById(stages, "ironing").state, "upcoming");
  }
  {
    const stages = presentationStages({
      status: "IN_PROCESS",
      completedPointIds: ["pickup", "plant_sorting", "plant_stain", "plant_processing"],
      milestoneTimes: { plant_processing: iso(400_000) },
    });
    eq("stages: processing done → washing done", stageById(stages, "washing").state, "done");
    eq("stages: processing done → drying done with it (shared handover)", stageById(stages, "drying").state, "done");
    eq("stages: processing done → drying time is the processing handover", stageById(stages, "drying").at, iso(400_000));
    eq("stages: processing done → ironing current", stageById(stages, "ironing").state, "current");
  }
  {
    const mid = presentationStages({ status: "IN_PROCESS", completedPointIds: ["plant_processing", "plant_finishing"] });
    eq("stages: finishing done → quality check current", stageById(mid, "quality_check").state, "current");
    eq("stages: finishing done → ironing done", stageById(mid, "ironing").state, "done");
    const qc = presentationStages({ status: "IN_PROCESS", completedPointIds: ["plant_processing", "plant_finishing", "plant_qc"] });
    eq("stages: qc done → packed current", stageById(qc, "packed").state, "current");
    const packed = presentationStages({ status: "IN_PROCESS", completedPointIds: ["plant_processing", "plant_finishing", "plant_qc", "plant_packing"] });
    eq("stages: packing done → packed done", stageById(packed, "packed").state, "done");
  }
  {
    const ready = presentationStages({ status: "READY" });
    eq("stages: READY → whole care band done", ["washing", "drying", "ironing", "quality_check", "packed"].every((id) => stageById(ready, id).state === "done"), true);
    eq("stages: READY → out for delivery upcoming", stageById(ready, "out_for_delivery").state, "upcoming");
    const out = presentationStages({ status: "OUT_FOR_DELIVERY" });
    eq("stages: OUT → out for delivery current", stageById(out, "out_for_delivery").state, "current");
    const done = presentationStages({ status: "DELIVERED", statusTimes: { DELIVERED: iso(100_000) } });
    eq("stages: DELIVERED → delivered current (canonical parity)", stageById(done, "delivered").state, "current");
    eq("stages: DELIVERED → out for delivery done", stageById(done, "out_for_delivery").state, "done");
    eq("stages: DELIVERED → delivered time shown", stageById(done, "delivered").at, iso(100_000));
  }
  {
    const pending = presentationStages({ status: "PAYMENT_PENDING", createdAt: iso(900_000) });
    check("stages: payment side-state lights nothing", pending.every((s) => s.state === "upcoming"));
    const stray = presentationStages({ status: "PICKED_UP", completedPointIds: ["plant_processing"] });
    eq("stages: stray plant milestone cannot outrun the lifecycle", stageById(stray, "washing").state, "upcoming");
  }

  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length > 0) {
    console.error(`Failing: ${failures.join("; ")}`);
    process.exit(1);
  }
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
