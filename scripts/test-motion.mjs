/**
 * Motion tests (Phase 5 — 3D experience, Scope M). Plain node, no
 * test framework, same pattern as scripts/test-tracking.mjs:
 * compiles src/lib/motion.ts (pulling in tracking → handovers →
 * org) with the project's own TypeScript into a scratch dir, then
 * asserts the pure RULES the components obey:
 *   1. hero render mode — canvas only with WebGL + motion allowed,
 *   2. tilt enablement + geometry (centre = no tilt, edges clamp),
 *   3. rider-marker transitions — glide only between two recorded
 *      points a plausible step apart; snap otherwise; easing and
 *      interpolation stay between the recorded endpoints.
 *   4. scroll-driven motion (glass + 3D scroll pass) — hero scroll
 *      progress + garment rotation clamp to their ranges, the
 *      shared progress channel clamps writes, reveal stagger caps,
 *      and parallax offsets clamp; one reduced-motion gate rules
 *      all of it.
 * The WebGL scene, DOM tilt and Leaflet rendering are NOT unit
 * tested — only the decisions behind them are.
 * Run: `npm run test:motion`. Exits non-zero on failure.
 */
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtempSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const scratch = mkdtempSync(join(projectRoot, ".test-scratch-motion-"));

try {
  const tscBin = join(projectRoot, "node_modules", ".bin", "tsc");
  execFileSync(
    tscBin,
    [
      "src/lib/motion.ts",
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
  const motion = require(join(scratch, "motion.js"));
  const {
    TILT_MAX_DEG,
    MARKER_ANIMATION_MS,
    heroRenderMode,
    tiltEnabled,
    clampTiltDeg,
    tiltFromPointer,
    planMarkerTransition,
    clamp01,
    easeInOutCubic,
    interpolateLatLng,
    markerPositionAt,
    HERO_SCROLL_MAX_ROTATION_Y,
    HERO_SCROLL_MAX_TILT_X,
    REVEAL_STAGGER_STEP_MS,
    REVEAL_STAGGER_MAX_MS,
    PARALLAX_MAX_OFFSET_PX,
    scrollMotionEnabled,
    heroScrollProgress,
    heroScrollRotation,
    heroScrollState,
    setHeroScrollProgress,
    getHeroScrollProgress,
    revealDelayMs,
    parallaxOffset,
    parallaxEnabled,
  } = motion;

  let passed = 0;
  const failures = [];
  function check(name, condition) {
    if (condition) {
      passed += 1;
    } else {
      failures.push(name);
      console.error(`FAIL: ${name}`);
    }
  }
  function near(a, b, eps = 1e-9) {
    return Math.abs(a - b) <= eps;
  }

  /* 1. Hero render mode ------------------------------------------ */
  check("hero: WebGL + motion allowed → canvas",
    heroRenderMode({ webglSupported: true, prefersReducedMotion: false }) === "canvas");
  check("hero: no WebGL → static",
    heroRenderMode({ webglSupported: false, prefersReducedMotion: false }) === "static");
  check("hero: reduced motion → static even with WebGL",
    heroRenderMode({ webglSupported: true, prefersReducedMotion: true }) === "static");
  check("hero: no WebGL + reduced motion → static",
    heroRenderMode({ webglSupported: false, prefersReducedMotion: true }) === "static");

  /* 2. Tilt ------------------------------------------------------- */
  check("tilt: fine pointer + motion allowed → enabled",
    tiltEnabled({ pointerFine: true, prefersReducedMotion: false }) === true);
  check("tilt: coarse pointer → disabled",
    tiltEnabled({ pointerFine: false, prefersReducedMotion: false }) === false);
  check("tilt: reduced motion → disabled",
    tiltEnabled({ pointerFine: true, prefersReducedMotion: true }) === false);
  check("tilt: default cap is 8deg", TILT_MAX_DEG === 8);

  const centre = tiltFromPointer({ offsetX: 100, offsetY: 50, width: 200, height: 100 });
  check("tilt: centre → no rotation", centre.rotateXDeg === 0 && centre.rotateYDeg === 0);
  check("tilt: centre → sheen centred", centre.sheenXPercent === 50 && centre.sheenYPercent === 50);

  const corner = tiltFromPointer({ offsetX: 200, offsetY: 0, width: 200, height: 100 });
  check("tilt: top-right corner → +max rotateY, +max rotateX",
    corner.rotateYDeg === TILT_MAX_DEG && corner.rotateXDeg === TILT_MAX_DEG);
  const opposite = tiltFromPointer({ offsetX: 0, offsetY: 100, width: 200, height: 100 });
  check("tilt: bottom-left corner → -max both",
    opposite.rotateYDeg === -TILT_MAX_DEG && opposite.rotateXDeg === -TILT_MAX_DEG);

  const beyond = tiltFromPointer({ offsetX: 999, offsetY: -50, width: 200, height: 100 });
  check("tilt: pointer outside → clamped to max + sheen clamped",
    beyond.rotateYDeg === TILT_MAX_DEG && beyond.rotateXDeg === TILT_MAX_DEG &&
    beyond.sheenXPercent === 100 && beyond.sheenYPercent === 0);

  const custom = tiltFromPointer({ offsetX: 200, offsetY: 50, width: 200, height: 100, maxDeg: 4 });
  check("tilt: custom max respected", custom.rotateYDeg === 4);
  check("clampTiltDeg: clamps both ways + NaN → 0",
    clampTiltDeg(20, 8) === 8 && clampTiltDeg(-20, 8) === -8 && clampTiltDeg(Number.NaN, 8) === 0);

  /* 3. Marker transitions ----------------------------------------- */
  // Bokaro Steel City reference points.
  const base = { lat: 23.6693, lng: 86.1511 };
  const stepNear = { lat: 23.6702, lng: 86.1511 }; // ≈100 m north
  const stepFar = { lat: 23.7, lng: 86.1511 }; // ≈3.4 km north

  check("marker: no previous position → snap",
    planMarkerTransition(null, stepNear).kind === "snap");
  check("marker: reduced motion → snap",
    planMarkerTransition(base, stepNear, { prefersReducedMotion: true }).kind === "snap");
  check("marker: identical point → snap",
    planMarkerTransition(base, { ...base }).kind === "snap");
  check("marker: teleport (>1.5 km) → snap",
    planMarkerTransition(base, stepFar).kind === "snap");

  const glide = planMarkerTransition(base, stepNear);
  check("marker: plausible step → animate",
    glide.kind === "animate" && glide.durationMs === MARKER_ANIMATION_MS);
  check("marker: glide runs from the previous RECORDED point to the newest",
    glide.kind === "animate" &&
    glide.from.lat === base.lat && glide.from.lng === base.lng &&
    glide.to.lat === stepNear.lat && glide.to.lng === stepNear.lng);
  check("marker: duration is one second", MARKER_ANIMATION_MS === 1000);

  const at0 = interpolateLatLng(base, stepNear, 0);
  const at1 = interpolateLatLng(base, stepNear, 1);
  const atMid = interpolateLatLng(base, stepNear, 0.5);
  check("interp: t=0 is the from point", at0.lat === base.lat && at0.lng === base.lng);
  check("interp: t=1 is the to point", at1.lat === stepNear.lat && at1.lng === stepNear.lng);
  check("interp: t=0.5 is the midpoint",
    near(atMid.lat, (base.lat + stepNear.lat) / 2) && near(atMid.lng, base.lng));
  check("interp: t clamps below 0 and above 1",
    interpolateLatLng(base, stepNear, -3).lat === base.lat &&
    interpolateLatLng(base, stepNear, 7).lat === stepNear.lat);

  check("ease: endpoints + midpoint",
    easeInOutCubic(0) === 0 && easeInOutCubic(1) === 1 && near(easeInOutCubic(0.5), 0.5));
  check("ease: monotonic across the curve",
    easeInOutCubic(0.25) < easeInOutCubic(0.5) && easeInOutCubic(0.5) < easeInOutCubic(0.75));
  check("clamp01: bounds + NaN",
    clamp01(-1) === 0 && clamp01(2) === 1 && clamp01(0.4) === 0.4 && clamp01(Number.NaN) === 0);

  const posStart = markerPositionAt(base, stepNear, 0, 1000);
  const posEnd = markerPositionAt(base, stepNear, 1400, 1000);
  const posMid = markerPositionAt(base, stepNear, 500, 1000);
  check("positionAt: start = from, overshoot = to",
    posStart.lat === base.lat && posEnd.lat === stepNear.lat && posEnd.lng === stepNear.lng);
  check("positionAt: eased midpoint is the segment midpoint",
    near(posMid.lat, (base.lat + stepNear.lat) / 2, 1e-9));
  check("positionAt: never travels beyond the newest recorded point",
    posMid.lat > base.lat && posMid.lat < stepNear.lat);

  /* 4. Scroll-driven motion (glass + 3D scroll pass) --------------- */
  check("scroll gate: motion allowed → on",
    scrollMotionEnabled({ prefersReducedMotion: false }) === true);
  check("scroll gate: reduced motion → everything off",
    scrollMotionEnabled({ prefersReducedMotion: true }) === false);

  check("hero progress: top at viewport top → 0",
    heroScrollProgress({ heroTop: 0, heroHeight: 600 }) === 0);
  check("hero progress: hero still below the fold line → 0",
    heroScrollProgress({ heroTop: 240, heroHeight: 600 }) === 0);
  check("hero progress: half scrolled → 0.5",
    near(heroScrollProgress({ heroTop: -300, heroHeight: 600 }), 0.5));
  check("hero progress: fully scrolled → 1",
    heroScrollProgress({ heroTop: -600, heroHeight: 600 }) === 1);
  check("hero progress: overscroll clamps to 1",
    heroScrollProgress({ heroTop: -2400, heroHeight: 600 }) === 1);
  check("hero progress: zero height → 0",
    heroScrollProgress({ heroTop: -300, heroHeight: 0 }) === 0);
  check("hero progress: NaN inputs → 0",
    heroScrollProgress({ heroTop: Number.NaN, heroHeight: 600 }) === 0 &&
    heroScrollProgress({ heroTop: -300, heroHeight: Number.NaN }) === 0);

  check("hero rotation caps: 0.55 rad Y, slight X tilt",
    HERO_SCROLL_MAX_ROTATION_Y === 0.55 && HERO_SCROLL_MAX_TILT_X > 0 && HERO_SCROLL_MAX_TILT_X <= 0.15);
  const rot0 = heroScrollRotation(0);
  const rotMid = heroScrollRotation(0.5);
  const rotFull = heroScrollRotation(1);
  check("hero rotation: 0 at rest",
    rot0.rotationY === 0 && rot0.rotationX === 0);
  check("hero rotation: half progress → half rotation",
    near(rotMid.rotationY, HERO_SCROLL_MAX_ROTATION_Y / 2) &&
    near(rotMid.rotationX, HERO_SCROLL_MAX_TILT_X / 2));
  check("hero rotation: full progress → the caps",
    rotFull.rotationY === HERO_SCROLL_MAX_ROTATION_Y &&
    rotFull.rotationX === HERO_SCROLL_MAX_TILT_X);
  check("hero rotation: out-of-range progress clamps",
    heroScrollRotation(7).rotationY === HERO_SCROLL_MAX_ROTATION_Y &&
    heroScrollRotation(-2).rotationY === 0 &&
    heroScrollRotation(Number.NaN).rotationY === 0);

  setHeroScrollProgress(0.3);
  check("hero channel: write then read",
    getHeroScrollProgress() === 0.3 && heroScrollState.progress === 0.3);
  setHeroScrollProgress(2);
  check("hero channel: writes clamp above 1", getHeroScrollProgress() === 1);
  setHeroScrollProgress(-1);
  check("hero channel: writes clamp below 0", getHeroScrollProgress() === 0);
  setHeroScrollProgress(Number.NaN);
  check("hero channel: NaN write → 0", getHeroScrollProgress() === 0);
  setHeroScrollProgress(0);

  check("reveal stagger: first block is immediate", revealDelayMs(0) === 0);
  check("reveal stagger: steps of 120ms",
    REVEAL_STAGGER_STEP_MS === 120 && revealDelayMs(1) === 120 && revealDelayMs(3) === 360);
  check("reveal stagger: capped at the max",
    REVEAL_STAGGER_MAX_MS === 600 && revealDelayMs(10) === 600 && revealDelayMs(100) === 600);
  check("reveal stagger: negative / NaN index → 0",
    revealDelayMs(-2) === 0 && revealDelayMs(Number.NaN) === 0);
  check("reveal stagger: fractional index floors",
    revealDelayMs(2.9) === 240);

  check("parallax: offset is scrollY × speed",
    parallaxOffset(1000, 0.1) === 100 && parallaxOffset(250, 0.06) === 15);
  check("parallax: negative speed drifts the other way",
    parallaxOffset(1000, -0.1) === -100);
  check("parallax: long pages clamp at the cap",
    PARALLAX_MAX_OFFSET_PX === 480 &&
    parallaxOffset(100000, 0.12) === 480 &&
    parallaxOffset(100000, -0.12) === -480);
  check("parallax: custom cap respected",
    parallaxOffset(10000, 0.1, 200) === 200);
  check("parallax: non-finite inputs drift nowhere",
    parallaxOffset(Number.NaN, 0.1) === 0 && parallaxOffset(100, Number.NaN) === 0);

  check("parallax gate: needs motion allowed AND targets",
    parallaxEnabled({ prefersReducedMotion: false, targetCount: 3 }) === true &&
    parallaxEnabled({ prefersReducedMotion: true, targetCount: 3 }) === false &&
    parallaxEnabled({ prefersReducedMotion: false, targetCount: 0 }) === false);

  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length > 0) process.exit(1);
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
