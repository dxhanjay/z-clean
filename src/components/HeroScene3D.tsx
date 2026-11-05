"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { ContactShadows, RoundedBox } from "@react-three/drei";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { AnnotationChip } from "./HeroVisual";
import {
  getHeroScrollProgress,
  heroScrollRotation,
  stackSwayAngleAt,
  turntableAngleAt,
} from "@/lib/motion";

/**
 * The 3D hero (Phase 5, Scope M — realism pass) — a real-time
 * WebGL composition that replaces the static HeroVisual ONLY on
 * capable, motion-allowed devices (the decision lives in
 * HeroShowcase + src/lib/motion.ts; this component is loaded via
 * next/dynamic with ssr:false, so three.js ships in its own lazy
 * chunk that no other route ever downloads).
 *
 * The scene is a stylised interpretation of the owner's reference
 * board: ONE pristine white dress shirt floating upright — folded
 * collar with an open V, a buttoned front placket, long sleeves
 * with a natural droop, a chest pocket — beside a neat
 * folded-garment stack, on a blue-grey studio stage.
 *
 * REALISM PASS (owner verdict on v1: "looking like cartoon"):
 * the flat extrusion + flat lights were replaced by —
 *   - image-based lighting from a locally generated
 *     RoomEnvironment (PMREM) — no downloaded HDRs;
 *   - a parametric cloth surface for the torso: waist taper,
 *     chest fullness, drape undulations and micro-wrinkles baked
 *     into the vertices, the placket modelled as a raised strip
 *     with stitch grooves displaced into the surface itself;
 *   - sleeves as tapered tubes swept along drooping CatmullRom
 *     curves (no straight cylinders);
 *   - a procedural cotton weave (canvas-generated bump +
 *     roughness maps) on every cloth material, tuned sheen, and
 *     glossy pearl-dome buttons;
 *   - a painted studio backdrop (canvas gradient) behind the
 *     garments, ACES tone mapping, sparse dust motes.
 *
 * TURNTABLE (owner's reference videos): the shirt performs a
 * slow, endless product-turntable revolution — one turn every
 * 28 s with a 1.5 s ease-in from rest — composed additively
 * with the scroll response and pointer parallax, while the
 * folded stack stays anchored with only a ±0.06 rad counter-
 * sway. The rules live in turntableAngleAt / stackSwayAngleAt
 * (src/lib/motion.ts §5).
 *
 * ASSET RULE (unchanged): every mesh is procedural geometry and
 * every texture is a runtime-generated canvas. No model files, no
 * image textures, no external assets of any kind — licence-clean
 * by construction.
 *
 * Performance contract (unchanged): DPR capped (≤2, ≤1.5 on
 * small screens), frameloop paused while the hero is off-screen
 * or the tab is hidden, contact-shadow ground instead of shadow
 * maps, and the canvas is pointer-events:none — pointer parallax
 * is read from a window listener, so the canvas can never block
 * the hero CTAs.
 */

const CLOTH_WHITE = "#f7f9fc";
const CLOTH_SHADE = "#e9eff6";

/* ------------------------------------------------------------------ */
/* Deterministic helpers                                               */
/* ------------------------------------------------------------------ */

function hash2(i: number, j: number): number {
  let h = Math.imul(i * 374761393 + j * 668265263, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1103515245);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const sstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const gauss = (x: number) => Math.exp(-x * x);

/* ------------------------------------------------------------------ */
/* Studio environment — image-based lighting, generated on-device      */
/* ------------------------------------------------------------------ */

function StudioEnvironment() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const envScene = new RoomEnvironment();
    const target = pmrem.fromScene(envScene, 0.04);
    scene.environment = target.texture;
    return () => {
      if (scene.environment === target.texture) scene.environment = null;
      target.dispose();
      envScene.dispose();
      pmrem.dispose();
    };
  }, [gl, scene]);
  return null;
}

/* ------------------------------------------------------------------ */
/* Procedural cotton weave — one canvas pattern, two maps              */
/* ------------------------------------------------------------------ */

/**
 * A plain-weave pattern drawn thread by thread (alternating
 * over/under cells, tiny per-thread luminance jitter). Each
 * thread is drawn fully inside its cell, so the tile wraps
 * seamlessly. Used twice with different palettes: high-contrast
 * greys for the bump map, a compressed 0.65–0.87 range for the
 * roughness map (fabric roughness ≈ 0.78 on average).
 */
function drawWeave(
  low: string,
  mid: string,
  high: string,
  size = 256,
  cell = 8,
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  ctx.fillStyle = mid;
  ctx.fillRect(0, 0, size, size);
  const n = size / cell;
  for (let j = 0; j < n; j += 1) {
    for (let i = 0; i < n; i += 1) {
      const horizontal = (i + j) % 2 === 0;
      const grad = horizontal
        ? ctx.createLinearGradient(0, j * cell, 0, (j + 1) * cell)
        : ctx.createLinearGradient(i * cell, 0, (i + 1) * cell, 0);
      grad.addColorStop(0, low);
      grad.addColorStop(0.5, high);
      grad.addColorStop(1, low);
      ctx.save();
      ctx.globalAlpha = 0.9 + hash2(i, j) * 0.1;
      ctx.fillStyle = grad;
      if (horizontal) ctx.fillRect(i * cell, j * cell + 0.8, cell, cell - 1.6);
      else ctx.fillRect(i * cell + 0.8, j * cell, cell - 1.6, cell);
      ctx.restore();
    }
  }
  return canvas;
}

interface FabricTextures {
  bump: THREE.CanvasTexture;
  roughness: THREE.CanvasTexture;
}

function useFabricTextures(): FabricTextures {
  const textures = useMemo<FabricTextures>(() => {
    const bump = new THREE.CanvasTexture(
      drawWeave("#404040", "#808080", "#e6e6e6"),
    );
    const roughness = new THREE.CanvasTexture(
      drawWeave("#a6a6a6", "#c2c2c2", "#e0e0e0"),
    );
    for (const t of [bump, roughness]) {
      t.wrapS = THREE.RepeatWrapping;
      t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(7, 10);
      t.anisotropy = 8;
    }
    return { bump, roughness };
  }, []);
  useEffect(
    () => () => {
      textures.bump.dispose();
      textures.roughness.dispose();
    },
    [textures],
  );
  return textures;
}

/** Shared cloth material props — weave maps + tuned sheen. */
function fabricProps(
  tex: FabricTextures,
  color: string,
  envMapIntensity = 0.6,
) {
  return {
    color,
    roughness: 1,
    roughnessMap: tex.roughness,
    bumpMap: tex.bump,
    bumpScale: 0.18,
    metalness: 0,
    sheen: 1,
    sheenRoughness: 0.5,
    sheenColor: "#e9f1fa",
    clearcoat: 0.05,
    clearcoatRoughness: 0.6,
    envMapIntensity,
    side: THREE.DoubleSide,
  } as const;
}

const PEARL_PROPS = {
  color: "#f4efe4",
  roughness: 0.24,
  metalness: 0,
  clearcoat: 1,
  clearcoatRoughness: 0.22,
  envMapIntensity: 1,
} as const;

/* ------------------------------------------------------------------ */
/* The shirt as a parametric cloth surface                             */
/*                                                                     */
/* u ∈ [-1, 1] across the body, v ∈ [0, 1] hem → neck. Every part of   */
/* the torso (panels, seams, buttons, pocket) is placed from the       */
/* same surface functions, so details always hug the cloth.            */
/* ------------------------------------------------------------------ */

const HW_SPLINE = new THREE.SplineCurve(
  [
    [0, 1.3],
    [0.16, 1.245],
    [0.3, 1.17],
    [0.44, 1.125],
    [0.58, 1.2],
    [0.72, 1.29],
    [0.84, 1.335],
    [0.93, 1.355],
    [1, 1.335],
  ].map(([x, y]) => new THREE.Vector2(x, y)),
);
const HW_SAMPLES = (() => {
  const arr = new Float32Array(257);
  for (let i = 0; i <= 256; i += 1) arr[i] = HW_SPLINE.getPoint(i / 256).y;
  return arr;
})();

/** Half body width at height v — waist taper, chest, shoulders. */
function halfWidthAt(v: number): number {
  const x = Math.min(1, Math.max(0, v)) * 256;
  const i = Math.floor(x);
  const f = x - i;
  return HW_SAMPLES[i] * (1 - f) + HW_SAMPLES[Math.min(256, i + 1)] * f;
}

/** Top edge: neck plateau sloping down to the shoulder tips,
 *  with the front neckline scooped into a V. */
function topYAt(u: number, front: boolean): number {
  const shoulder = 2.1 - 0.22 * Math.pow(sstep(0.38, 1, Math.abs(u)), 1.1);
  const scoop = front ? 0.34 * gauss(u / 0.3) : 0.09 * gauss(u / 0.34);
  return shoulder - scoop;
}

/** Hem edge: shirttail curve — sides rise, front centre dips. */
function hemYAt(u: number, front: boolean): number {
  return (
    -2.06 +
    0.15 * Math.pow(Math.abs(u), 2.4) -
    (front ? 0.05 : 0.02) * gauss(u / 0.55)
  );
}

/** Torso depth fullness: fuller chest, hollow waist. */
function fullnessAt(v: number): number {
  return (
    0.86 + 0.2 * gauss((v - 0.74) / 0.2) - 0.05 * gauss((v - 0.44) / 0.13)
  );
}

/** Rounded-rectangle cross-section falloff (1 at centre → ~0.35
 *  at the side seam, where the edge strips take over). */
function plateau(u: number): number {
  return Math.pow(Math.cos(u * Math.PI * 0.46), 0.5);
}

function frontZAt(u: number, v: number): number {
  const au = Math.abs(u);
  let z = 0.3 * fullnessAt(v) * plateau(u);
  // Placket: a raised centre strip with stitch grooves at its
  // edges, displaced into the surface; fades under the collar.
  const mask = sstep(0.94, 0.86, v);
  z += 0.014 * sstep(0.115, 0.07, au) * mask;
  z -= 0.02 * gauss((au - 0.115) / 0.02) * mask;
  // Drape: broad vertical undulation + fine wrinkles — stronger
  // toward the hem and sides, calmer across the chest.
  const calm = 1 - 0.55 * gauss((v - 0.74) / 0.16);
  const amp =
    0.016 * (0.3 + 0.7 * (1 - v)) * (0.35 + 0.65 * Math.pow(au, 1.5)) * calm;
  z +=
    amp *
    (Math.sin(u * 6.3 + 1.4 * Math.sin(v * 4.2) + 0.8) * 0.6 +
      Math.sin(v * 12.5 - u * 2.6) * 0.4);
  z += 0.01 * Math.sin(u * 3.4 + 0.5) * Math.pow(1 - v, 1.5) * plateau(u);
  z += 0.007 * Math.sin(u * 20 + 1) * Math.pow(1 - v, 3) * plateau(u);
  return z;
}

function backZAt(u: number, v: number): number {
  const au = Math.abs(u);
  let z = -0.26 * fullnessAt(v) * Math.pow(plateau(u), 0.9);
  const amp = 0.012 * (0.35 + 0.65 * (1 - v)) * (0.4 + 0.6 * au);
  z +=
    amp * Math.sin(u * 5.7 + 2.1 + Math.sin(v * 3.8)) +
    0.006 * Math.sin(v * 10.5 + u * 2.2);
  return z;
}

function surfacePoint(
  u: number,
  v: number,
  front: boolean,
  out: THREE.Vector3,
): THREE.Vector3 {
  const hem = hemYAt(u, front);
  const top = topYAt(u, front);
  out.set(
    u * halfWidthAt(v),
    hem + (top - hem) * v,
    front ? frontZAt(u, v) : backZAt(u, v),
  );
  return out;
}

/** Position + orientation for a detail sitting on the front. */
function surfacePlacement(u: number, v: number) {
  const p = surfacePoint(u, v, true, new THREE.Vector3());
  const pu = surfacePoint(u + 0.02, v, true, new THREE.Vector3());
  const pv = surfacePoint(u, v + 0.01, true, new THREE.Vector3());
  const n = new THREE.Vector3()
    .subVectors(pv, p)
    .cross(new THREE.Vector3().subVectors(pu, p))
    .normalize();
  if (n.z < 0) n.negate();
  const quaternion = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 0, 1),
    n,
  );
  return { position: p.addScaledVector(n, 0.012), quaternion };
}

function buildPanelGeometry(front: boolean): THREE.BufferGeometry {
  const SU = 64;
  const SV = 80;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const p = new THREE.Vector3();
  for (let j = 0; j <= SV; j += 1) {
    const v = j / SV;
    for (let i = 0; i <= SU; i += 1) {
      const u = (i / SU) * 2 - 1;
      surfacePoint(u, v, front, p);
      positions.push(p.x, p.y, p.z);
      uvs.push(i / SU, v);
    }
  }
  for (let j = 0; j < SV; j += 1) {
    for (let i = 0; i < SU; i += 1) {
      const a = j * (SU + 1) + i;
      const b = a + 1;
      const c = a + SU + 1;
      const d = c + 1;
      if (front) indices.push(a, c, b, b, c, d);
      else indices.push(a, b, c, b, d, c);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * A seam strip closing front↔back along one boundary run, with a
 * slightly bulged middle column so the torso side reads rounded
 * rather than knife-edged.
 */
function buildEdgeStrip(
  samples: { u: number; v: number }[],
  midOffset: [number, number, number],
): THREE.BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const pf = new THREE.Vector3();
  const pb = new THREE.Vector3();
  samples.forEach(({ u, v }, k) => {
    surfacePoint(u, v, true, pf);
    surfacePoint(u, v, false, pb);
    const s = k / (samples.length - 1);
    positions.push(pf.x, pf.y, pf.z);
    uvs.push(s, 0);
    positions.push(
      (pf.x + pb.x) / 2 + midOffset[0],
      (pf.y + pb.y) / 2 + midOffset[1],
      (pf.z + pb.z) / 2 + midOffset[2],
    );
    uvs.push(s, 0.5);
    positions.push(pb.x, pb.y, pb.z);
    uvs.push(s, 1);
  });
  for (let k = 0; k < samples.length - 1; k += 1) {
    const a = k * 3;
    const b = a + 3;
    indices.push(
      a, b, a + 1,
      a + 1, b, b + 1,
      a + 1, b + 1, a + 2,
      a + 2, b + 1, b + 2,
    );
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function range(count: number, fn: (t: number) => { u: number; v: number }) {
  return Array.from({ length: count }, (_, i) => fn(i / (count - 1)));
}

function useTorsoGeometries() {
  const geometries = useMemo(() => {
    const front = buildPanelGeometry(true);
    const back = buildPanelGeometry(false);
    const left = buildEdgeStrip(
      range(33, (t) => ({ u: -1, v: t })),
      [-0.05, 0, 0],
    );
    const right = buildEdgeStrip(
      range(33, (t) => ({ u: 1, v: t })),
      [0.05, 0, 0],
    );
    const hem = buildEdgeStrip(
      range(33, (t) => ({ u: t * 2 - 1, v: 0 })),
      [0, -0.035, 0],
    );
    const shoulderL = buildEdgeStrip(
      range(17, (t) => ({ u: -1 + 0.64 * t, v: 1 })),
      [0, 0.02, 0],
    );
    const shoulderR = buildEdgeStrip(
      range(17, (t) => ({ u: 0.36 + 0.64 * t, v: 1 })),
      [0, 0.02, 0],
    );
    return [front, back, left, right, hem, shoulderL, shoulderR];
  }, []);
  useEffect(
    () => () => geometries.forEach((g) => g.dispose()),
    [geometries],
  );
  return geometries;
}

/* ------------------------------------------------------------------ */
/* Sleeves — tapered tubes swept along drooping curves                 */
/* ------------------------------------------------------------------ */

function buildTube(
  curve: THREE.CatmullRomCurve3,
  t0: number,
  t1: number,
  rings: number,
  radial: number,
  radiusAt: (t: number) => number,
  squash = 0.92,
): THREE.BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const center = new THREE.Vector3();
  const tangent = new THREE.Vector3();
  const n1 = new THREE.Vector3();
  const n2 = new THREE.Vector3();
  const zAxis = new THREE.Vector3(0, 0, 1);
  for (let j = 0; j <= rings; j += 1) {
    const t = t0 + (t1 - t0) * (j / rings);
    curve.getPointAt(t, center);
    curve.getTangentAt(t, tangent);
    n1.crossVectors(tangent, zAxis);
    if (n1.lengthSq() < 0.25) n1.set(1, 0, 0);
    n1.normalize();
    n2.crossVectors(tangent, n1).normalize();
    const r = radiusAt(t);
    for (let i = 0; i <= radial; i += 1) {
      const a = (i / radial) * Math.PI * 2;
      const cx = Math.cos(a) * r;
      const cy = Math.sin(a) * r * squash;
      positions.push(
        center.x + n1.x * cx + n2.x * cy,
        center.y + n1.y * cx + n2.y * cy,
        center.z + n1.z * cx + n2.z * cy,
      );
      uvs.push(i / radial, t);
    }
  }
  for (let j = 0; j < rings; j += 1) {
    for (let i = 0; i < radial; i += 1) {
      const a = j * (radial + 1) + i;
      const b = a + 1;
      const c = a + radial + 1;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function Sleeve({
  side,
  tex,
}: {
  side: 1 | -1;
  tex: FabricTextures;
}) {
  const curve = useMemo(
    () =>
      new THREE.CatmullRomCurve3(
        [
          [1.29, 1.7, 0.01],
          [1.52, 1.3, 0.04],
          [1.68, 0.78, 0.09],
          [1.8, 0.18, 0.15],
          [1.88, -0.38, 0.2],
          [1.93, -0.66, 0.23],
        ].map(
          ([x, y, z]) => new THREE.Vector3(x * side, y, z),
        ),
      ),
    [side],
  );
  const tube = useMemo(
    () =>
      buildTube(curve, 0, 0.8, 36, 20, (t) =>
        THREE.MathUtils.lerp(0.335, 0.248, t / 0.8),
      ),
    [curve],
  );
  const cuff = useMemo(
    () =>
      buildTube(curve, 0.795, 1, 10, 20, (t) =>
        THREE.MathUtils.lerp(0.254, 0.244, (t - 0.795) / 0.205),
      ),
    [curve],
  );
  useEffect(
    () => () => {
      tube.dispose();
      cuff.dispose();
    },
    [tube, cuff],
  );
  const shoulder = curve.getPointAt(0);
  const cuffEnd = curve.getPointAt(1);
  const cuffEndQuat = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 0, 1),
    curve.getTangentAt(1),
  );
  const cuffButtonPos = curve
    .getPointAt(0.93)
    .add(new THREE.Vector3(0, 0.01, 0.243));
  return (
    <group>
      {/* Shoulder cap where the sleeve head meets the armhole. */}
      <mesh position={shoulder} scale={[1.06, 0.9, 0.9]}>
        <sphereGeometry args={[0.315, 28, 20]} />
        <meshPhysicalMaterial {...fabricProps(tex, CLOTH_WHITE)} />
      </mesh>
      <mesh geometry={tube}>
        <meshPhysicalMaterial {...fabricProps(tex, CLOTH_WHITE)} />
      </mesh>
      <mesh geometry={cuff}>
        <meshPhysicalMaterial {...fabricProps(tex, CLOTH_SHADE)} />
      </mesh>
      {/* Sleeve opening — a dark disc reads as the shadowed
          inside of the cuff. */}
      <mesh position={cuffEnd} quaternion={cuffEndQuat}>
        <circleGeometry args={[0.238, 24]} />
        <meshStandardMaterial
          color="#46586e"
          roughness={1}
          side={THREE.DoubleSide}
        />
      </mesh>
      <mesh position={cuffButtonPos} scale={[1, 1, 0.38]}>
        <sphereGeometry args={[0.036, 14, 12]} />
        <meshPhysicalMaterial {...PEARL_PROPS} />
      </mesh>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Collar — band with a front gap + two folded leaves                  */
/* ------------------------------------------------------------------ */

function useCollarLeafGeometry(): THREE.ExtrudeGeometry {
  return useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(0, 0.03);
    s.quadraticCurveTo(0.3, 0.14, 0.55, 0.02);
    s.quadraticCurveTo(0.62, -0.02, 0.6, -0.1);
    s.quadraticCurveTo(0.34, -0.3, 0.05, -0.24);
    s.quadraticCurveTo(-0.02, -0.1, 0, 0.03);
    const geometry = new THREE.ExtrudeGeometry(s, {
      depth: 0.03,
      bevelEnabled: true,
      bevelThickness: 0.012,
      bevelSize: 0.012,
      bevelSegments: 2,
      curveSegments: 10,
    });
    geometry.translate(0, 0, -0.015);
    return geometry;
  }, []);
}

function Collar({ tex }: { tex: FabricTextures }) {
  const leafGeometry = useCollarLeafGeometry();
  useEffect(() => () => leafGeometry.dispose(), [leafGeometry]);
  return (
    <group>
      {/* Band — wraps the neck, open at the front V. Cylinder
          theta starts at +z (front), so starting at 0.85 rad and
          sweeping 2π − 1.7 leaves the gap centred on the front. */}
      <mesh
        position={[0, 2.03, -0.01]}
        rotation={[0.05, 0, 0]}
        scale={[1.06, 1, 0.74]}
      >
        <cylinderGeometry
          args={[0.44, 0.5, 0.3, 40, 1, true, 0.85, Math.PI * 2 - 1.7]}
        />
        <meshPhysicalMaterial {...fabricProps(tex, CLOTH_WHITE)} />
      </mesh>
      {/* Shadowed inside of the neck opening. */}
      <mesh position={[0, 2.0, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={[1.45, 0.85, 1]}>
        <circleGeometry args={[0.3, 28]} />
        <meshStandardMaterial color="#3d4c61" roughness={1} />
      </mesh>
      {/* Leaves folded down from the band's front edges. */}
      {([1, -1] as const).map((side) => (
        <mesh
          key={side}
          geometry={leafGeometry}
          position={[0.4 * side, 2.06, 0.235]}
          rotation={[0.18, -0.35 * side, -0.12 * side]}
          scale={[side, 1, 1]}
        >
          <meshPhysicalMaterial {...fabricProps(tex, CLOTH_WHITE)} />
        </mesh>
      ))}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* The shirt                                                           */
/* ------------------------------------------------------------------ */

const BUTTON_Y = [1.28, 0.72, 0.16, -0.4, -0.96, -1.5];

function DressShirt() {
  const tex = useFabricTextures();
  const torso = useTorsoGeometries();
  const buttons = useMemo(
    () =>
      BUTTON_Y.map((y) => {
        const v =
          (y - hemYAt(0, true)) / (topYAt(0, true) - hemYAt(0, true));
        return surfacePlacement(0, v);
      }),
    [],
  );
  const pocket = useMemo(() => surfacePlacement(0.46, 0.68), []);
  return (
    <group>
      {torso.map((geometry, i) => (
        <mesh key={i} geometry={geometry}>
          <meshPhysicalMaterial {...fabricProps(tex, CLOTH_WHITE)} />
        </mesh>
      ))}

      <Collar tex={tex} />

      {/* Placket buttons — pearl domes seated on the surface. */}
      {buttons.map((b, i) => (
        <mesh
          key={i}
          position={b.position}
          quaternion={b.quaternion}
          scale={[1, 1, 0.38]}
        >
          <sphereGeometry args={[0.046, 16, 12]} />
          <meshPhysicalMaterial {...PEARL_PROPS} />
        </mesh>
      ))}

      {/* Chest pocket (wearer's left) with a folded top hem. */}
      <group position={pocket.position} quaternion={pocket.quaternion}>
        <RoundedBox args={[0.46, 0.52, 0.03]} radius={0.015} smoothness={3}>
          <meshPhysicalMaterial {...fabricProps(tex, CLOTH_SHADE)} />
        </RoundedBox>
        <RoundedBox
          args={[0.47, 0.08, 0.038]}
          radius={0.018}
          smoothness={3}
          position={[0, 0.245, 0.002]}
        >
          <meshPhysicalMaterial {...fabricProps(tex, CLOTH_WHITE)} />
        </RoundedBox>
      </group>

      <Sleeve side={1} tex={tex} />
      <Sleeve side={-1} tex={tex} />
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Folded-garment stack                                                */
/* ------------------------------------------------------------------ */

function FoldedStack() {
  // Placement + counter-sway live on the wrapper group in
  // GarmentGroup; this group only builds the stack itself.
  const tex = useFabricTextures();
  // 3 folded garments + 1 striped one (two thin slabs in
  // alternating palette colours — no textures anywhere).
  const layers: {
    y: number;
    h: number;
    color: string;
    x?: number;
    z?: number;
    rotY?: number;
  }[] = [
    { y: 0.15, h: 0.3, color: "#ffffff", rotY: 0.05 },
    { y: 0.44, h: 0.28, color: "#c7dcee", x: -0.03, rotY: -0.07 },
    { y: 0.65, h: 0.14, color: "#ffffff", x: 0.02, rotY: 0.03 },
    { y: 0.79, h: 0.14, color: "#a8c4de", x: 0.02, rotY: 0.03 },
    { y: 0.99, h: 0.26, color: "#d7f2ec", x: 0.04, z: 0.02, rotY: 0.1 },
  ];
  return (
    <group>
      {layers.map((layer, i) => (
        <RoundedBox
          key={i}
          args={[1.55, layer.h, 1.12]}
          radius={Math.min(0.085, layer.h * 0.42)}
          smoothness={4}
          position={[layer.x ?? 0, layer.y, layer.z ?? 0]}
          rotation={[0, layer.rotY ?? 0, 0]}
        >
          <meshPhysicalMaterial
            {...fabricProps(tex, layer.color, 0.5)}
          />
        </RoundedBox>
      ))}
      {/* The folded-over top layer of the uppermost garment. */}
      <RoundedBox
        args={[1.5, 0.055, 0.52]}
        radius={0.024}
        smoothness={3}
        position={[0.04, 1.145, 0.26]}
        rotation={[0, 0.1, 0]}
      >
        <meshPhysicalMaterial {...fabricProps(tex, "#e6f5f1", 0.5)} />
      </RoundedBox>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Studio backdrop + particles + ground glow (canvas textures)         */
/* ------------------------------------------------------------------ */

function StudioBackdrop() {
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = 512;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      const vertical = ctx.createLinearGradient(0, 0, 0, 512);
      vertical.addColorStop(0, "#e9f1f8");
      vertical.addColorStop(0.55, "#c3d4e6");
      vertical.addColorStop(1, "#93aacc");
      ctx.fillStyle = vertical;
      ctx.fillRect(0, 0, 1024, 512);
      const pool = ctx.createRadialGradient(472, 184, 40, 472, 184, 460);
      pool.addColorStop(0, "rgba(255,255,255,0.55)");
      pool.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = pool;
      ctx.fillRect(0, 0, 1024, 512);
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }, []);
  useEffect(() => () => texture.dispose(), [texture]);
  return (
    <mesh position={[0, 0.4, -4.8]}>
      <planeGeometry args={[36, 20]} />
      <meshBasicMaterial map={texture} />
    </mesh>
  );
}

function radialSpriteTexture(
  stops: [number, string][],
  size = 64,
): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const gradient = ctx.createRadialGradient(
      size / 2, size / 2, 0, size / 2, size / 2, size / 2,
    );
    for (const [offset, color] of stops) gradient.addColorStop(offset, color);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

function Particles({ count = 55 }: { count?: number }) {
  const ref = useRef<THREE.Points | null>(null);
  const { positions, texture } = useMemo(() => {
    // Deterministic pseudo-random field (mulberry32) — the same
    // sparse drift of dust motes on every load, no Math.random.
    let seed = 20261105;
    const rand = () => {
      seed |= 0;
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) {
      arr[i * 3] = (rand() - 0.5) * 8.6;
      arr[i * 3 + 1] = (rand() - 0.5) * 5.4 + 0.3;
      arr[i * 3 + 2] = (rand() - 0.5) * 3 - 0.4;
    }
    return {
      positions: arr,
      texture: radialSpriteTexture([
        [0, "rgba(255,255,255,1)"],
        [0.4, "rgba(255,255,255,0.5)"],
        [1, "rgba(255,255,255,0)"],
      ]),
    };
  }, [count]);

  useFrame((state) => {
    if (!ref.current) return;
    ref.current.rotation.y = state.clock.elapsedTime * 0.012;
    ref.current.position.y = Math.sin(state.clock.elapsedTime * 0.18) * 0.12;
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        size={0.07}
        map={texture}
        transparent
        opacity={0.26}
        color="#8fb0d4"
        depthWrite={false}
        sizeAttenuation
      />
    </points>
  );
}

function PedestalGlow() {
  const texture = useMemo(
    () =>
      radialSpriteTexture(
        [
          [0, "rgba(143,176,212,0.42)"],
          [0.55, "rgba(168,196,222,0.18)"],
          [1, "rgba(168,196,222,0)"],
        ],
        256,
      ),
    [],
  );
  return (
    <mesh position={[0, -2.345, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <circleGeometry args={[3.2, 48]} />
      <meshBasicMaterial map={texture} transparent depthWrite={false} />
    </mesh>
  );
}

/* ------------------------------------------------------------------ */
/* Rig — levitation + pointer parallax + turntable                     */
/*                                                                     */
/* Three nested groups, one frame loop:                                */
/*   stage group — levitation (position.y) and the shared X lean       */
/*     (idle sway + pointer Y + scroll tilt) for the whole             */
/*     composition;                                                    */
/*   shirt group — the Y composition: TURNTABLE (the centrepiece,      */
/*     a slow endless revolution from turntableAngleAt) + scroll       */
/*     offset (+0.55 max) + pointer parallax + idle sway, so the       */
/*     shirt turns front → side → back → front like a product          */
/*     showcase while still answering the visitor;                     */
/*   stack group — world-anchored beside the shirt: it never           */
/*     turns, only breathes ±0.06 rad of counter-sway                  */
/*     (stackSwayAngleAt) around its own base.                         */
/* Every angle derives from the frame clock — no React state, and      */
/* the frameloop gates (off-screen / hidden tab) freeze the clock,     */
/* so the turntable pauses with everything else. Reduced-motion        */
/* visitors never mount the scene at all (HeroShowcase's rule).        */
/* ------------------------------------------------------------------ */

function GarmentGroup() {
  const ref = useRef<THREE.Group | null>(null);
  const shirtRef = useRef<THREE.Group | null>(null);
  const stackRef = useRef<THREE.Group | null>(null);
  const pointerTarget = useRef({ x: 0, y: 0 });
  const pointerSmooth = useRef({ x: 0, y: 0 });
  const scrollSmooth = useRef(0);

  useEffect(() => {
    function onMove(event: PointerEvent) {
      pointerTarget.current = {
        x: (event.clientX / window.innerWidth) * 2 - 1,
        y: (event.clientY / window.innerHeight) * 2 - 1,
      };
    }
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, []);

  useFrame((state, delta) => {
    const group = ref.current;
    if (!group) return;
    const t = state.clock.elapsedTime;
    const lambda = 2.4;
    pointerSmooth.current.x = THREE.MathUtils.damp(
      pointerSmooth.current.x, pointerTarget.current.x, lambda, delta,
    );
    pointerSmooth.current.y = THREE.MathUtils.damp(
      pointerSmooth.current.y, pointerTarget.current.y, lambda, delta,
    );
    // Scroll response (glass + 3D scroll pass): HeroShowcase
    // publishes hero scroll progress to the motion channel; as
    // the hero scrolls away the garment turns to follow (up to
    // +0.55 rad Y with a slight X lean at full scroll — the rule
    // and its clamps live in heroScrollRotation). Damped like the
    // pointer so a fast flick never snaps the cloth.
    scrollSmooth.current = THREE.MathUtils.damp(
      scrollSmooth.current, getHeroScrollProgress(), 3.2, delta,
    );
    const scrollRotation = heroScrollRotation(scrollSmooth.current);
    group.position.y = Math.sin(t * 0.55) * 0.09;
    group.rotation.x =
      Math.sin(t * 0.3) * 0.012 + pointerSmooth.current.y * 0.045 +
      scrollRotation.rotationX;
    // Turntable (owner's reference videos): the shirt subgroup
    // carries the full Y composition — the endless revolution
    // (turntableAngleAt: 28 s per turn, 1.5 s ease-in from rest)
    // plus the scroll offset, the pointer parallax and the idle
    // sway that were here before, all composed additively.
    if (shirtRef.current) {
      shirtRef.current.rotation.y =
        turntableAngleAt(t) +
        scrollRotation.rotationY +
        pointerSmooth.current.x * 0.16 +
        Math.sin(t * 0.22) * 0.07 -
        0.05;
    }
    // The stack grounds the composition: no turntable, only its
    // own very slow counter-drift around its base.
    if (stackRef.current) {
      stackRef.current.rotation.y = stackSwayAngleAt(t);
    }
  });

  return (
    <group ref={ref}>
      <group ref={shirtRef} position={[-0.62, 0.18, 0]}>
        <DressShirt />
      </group>
      <group ref={stackRef} position={[1.72, -2.32, 0.72]}>
        <FoldedStack />
      </group>
    </group>
  );
}

function Scene() {
  return (
    <>
      <StudioEnvironment />
      <directionalLight position={[4.5, 6, 6.5]} intensity={1.1} color="#ffffff" />
      <directionalLight position={[-6, 2.5, -5]} intensity={0.55} color="#a8d8cf" />
      <directionalLight position={[-3, 0.5, 6]} intensity={0.25} color="#dfeaf5" />
      <StudioBackdrop />
      <GarmentGroup />
      <Particles />
      <PedestalGlow />
      <ContactShadows
        position={[0, -2.33, 0]}
        opacity={0.3}
        scale={12.5}
        blur={3.4}
        far={4.2}
        resolution={512}
        color="#16324f"
      />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Stage — mirrors HeroVisual's frame so the swap never shifts layout  */
/* ------------------------------------------------------------------ */

export default function HeroScene3D({
  onError,
}: {
  onError?: () => void;
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [active, setActive] = useState(true);

  // Render loop runs only while the hero is on screen AND the tab
  // is visible — a below-the-fold WebGL canvas must cost nothing.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    let inView = true;
    const update = () => setActive(inView && !document.hidden);
    const observer = new IntersectionObserver(
      (entries) => {
        inView = entries[0]?.isIntersecting ?? true;
        update();
      },
      { threshold: 0.05 },
    );
    observer.observe(el);
    document.addEventListener("visibilitychange", update);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", update);
    };
  }, []);

  const dpr = useMemo(() => {
    if (typeof window === "undefined") return 1;
    const cap = window.innerWidth < 640 ? 1.5 : 2;
    return Math.min(window.devicePixelRatio || 1, cap);
  }, []);

  return (
    <div className="relative mx-auto w-full max-w-xl lg:max-w-none">
      <div
        aria-hidden="true"
        className="absolute -inset-6 rounded-[3rem] bg-white/40 blur-2xl"
      />
      <div
        ref={wrapRef}
        className="relative overflow-hidden rounded-[2.5rem] bg-pastel-hero shadow-soft-xl ring-1 ring-white/60"
      >
        <div className="aspect-[4/3] w-full sm:aspect-[16/11]">
          <Canvas
            dpr={dpr}
            frameloop={active ? "always" : "never"}
            gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
            camera={{ position: [0, 0.1, 8.6], fov: 38 }}
            onCreated={(state) => {
              state.gl.toneMapping = THREE.ACESFilmicToneMapping;
              state.gl.toneMappingExposure = 1.06;
              state.gl.outputColorSpace = THREE.SRGBColorSpace;
            }}
            onError={onError}
            style={{ pointerEvents: "none" }}
            aria-hidden="true"
          >
            <Scene />
          </Canvas>
        </div>
      </div>

      <AnnotationChip
        text="Tough stain? We treat it with care"
        className="-top-4 left-4 sm:-left-4"
      />
      <AnnotationChip
        text="Every garment inspected by hand"
        className="right-4 top-1/3 sm:-right-3"
      />
    </div>
  );
}
