"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Canvas, useFrame } from "@react-three/fiber";
import { ContactShadows, RoundedBox } from "@react-three/drei";
import { AnnotationChip } from "./HeroVisual";

/**
 * The 3D hero (Phase 5, Scope M) — a real-time WebGL composition
 * that replaces the static HeroVisual ONLY on capable,
 * motion-allowed devices (the decision lives in
 * HeroShowcase + src/lib/motion.ts; this component is loaded via
 * next/dynamic with ssr:false, so three.js ships in its own lazy
 * chunk that no other route ever downloads).
 *
 * The scene is a stylised interpretation of the owner's reference
 * board: ONE pristine white dress shirt floating upright — collar
 * band + leaves, a buttoned front placket, long sleeves angled
 * gently down, a chest pocket — beside a neat folded-garment
 * stack, on a pastel studio stage with a soft pedestal glow.
 *
 * ASSET RULE: every mesh is procedural geometry built below
 * (extrusions, cylinders, rounded boxes) with cloth-like physical
 * materials. There are no model files, no textures, no external
 * assets of any kind — licence-clean by construction. The only
 * generated textures are canvas radial gradients (particle sprite
 * + ground glow), created at runtime in this file.
 *
 * Performance contract: DPR capped (≤2, ≤1.5 on small screens),
 * frameloop paused while the hero is off-screen or the tab is
 * hidden, contact-shadow ground instead of shadow maps, and the
 * canvas is pointer-events:none — pointer parallax is read from a
 * window listener, so the canvas can never block the hero CTAs.
 */

const CLOTH_WHITE = "#fdfdff";
const CLOTH_SHADE = "#eef3f9";

/* ------------------------------------------------------------------ */
/* Procedural shirt                                                    */
/* ------------------------------------------------------------------ */

function useShirtBodyGeometry(): THREE.ExtrudeGeometry {
  return useMemo(() => {
    // Front silhouette of a dress shirt: shoulders sloping in to
    // the neck scoop, gentle A-line sides, a curved shirttail hem.
    const s = new THREE.Shape();
    s.moveTo(-1.28, -2.05);
    s.quadraticCurveTo(-1.38, -0.8, -1.4, 0.55);
    s.lineTo(-1.43, 1.72);
    s.quadraticCurveTo(-1.44, 1.88, -1.26, 1.91);
    s.lineTo(-0.55, 2.06);
    s.quadraticCurveTo(0, 1.64, 0.55, 2.06);
    s.lineTo(1.26, 1.91);
    s.quadraticCurveTo(1.44, 1.88, 1.43, 1.72);
    s.lineTo(1.4, 0.55);
    s.quadraticCurveTo(1.38, -0.8, 1.28, -2.05);
    s.quadraticCurveTo(0, -2.26, -1.28, -2.05);
    const geometry = new THREE.ExtrudeGeometry(s, {
      depth: 0.34,
      steps: 1,
      bevelEnabled: true,
      bevelThickness: 0.07,
      bevelSize: 0.055,
      bevelSegments: 3,
      curveSegments: 24,
    });
    geometry.translate(0, 0, -0.17);
    return geometry;
  }, []);
}

function ClothMaterial({
  color = CLOTH_WHITE,
  roughness = 0.62,
}: {
  color?: string;
  roughness?: number;
}) {
  return (
    <meshPhysicalMaterial
      color={color}
      roughness={roughness}
      metalness={0}
      sheen={1}
      sheenRoughness={0.55}
      sheenColor="#cfe0f2"
      clearcoat={0.18}
      clearcoatRoughness={0.7}
    />
  );
}

function Sleeve({ side }: { side: 1 | -1 }) {
  // A long sleeve angled gently down-and-out from the shoulder:
  // a tapered tube + rounded shoulder cap + a cuff with a button.
  const angle = 0.3;
  const dirX = Math.sin(angle) * side;
  const dirY = -Math.cos(angle);
  const shoulder: [number, number, number] = [1.4 * side, 1.66, 0];
  const length = 2.1;
  const centre: [number, number, number] = [
    shoulder[0] + dirX * (length / 2),
    shoulder[1] + dirY * (length / 2),
    0,
  ];
  const cuff: [number, number, number] = [
    shoulder[0] + dirX * (length + 0.13),
    shoulder[1] + dirY * (length + 0.13),
    0,
  ];
  return (
    <group>
      <mesh position={shoulder} scale={[1.05, 0.95, 0.95]}>
        <sphereGeometry args={[0.36, 24, 18]} />
        <ClothMaterial />
      </mesh>
      <mesh position={centre} rotation={[0, 0, side * angle]}>
        <cylinderGeometry args={[0.3, 0.235, length, 24]} />
        <ClothMaterial />
      </mesh>
      <mesh position={cuff} rotation={[0, 0, side * angle]}>
        <cylinderGeometry args={[0.262, 0.262, 0.3, 24]} />
        <ClothMaterial color={CLOTH_SHADE} roughness={0.58} />
      </mesh>
      <mesh position={[cuff[0], cuff[1], 0.245]}>
        <sphereGeometry args={[0.042, 12, 12]} />
        <meshPhysicalMaterial
          color="#f8fafc"
          roughness={0.25}
          clearcoat={0.6}
          clearcoatRoughness={0.3}
        />
      </mesh>
    </group>
  );
}

function DressShirt() {
  const bodyGeometry = useShirtBodyGeometry();
  const buttons = [1.38, 0.8, 0.22, -0.36, -0.94, -1.52];
  return (
    <group>
      {/* Torso */}
      <mesh geometry={bodyGeometry}>
        <ClothMaterial />
      </mesh>

      {/* Collar band — an open elliptical ring at the neck. */}
      <mesh position={[0, 2.1, -0.01]} rotation={[0.06, 0, 0]} scale={[1, 1, 0.74]}>
        <cylinderGeometry args={[0.47, 0.53, 0.3, 32, 1, true]} />
        <meshPhysicalMaterial
          color={CLOTH_WHITE}
          roughness={0.58}
          metalness={0}
          sheen={1}
          sheenRoughness={0.5}
          sheenColor="#cfe0f2"
          clearcoat={0.18}
          clearcoatRoughness={0.7}
          side={THREE.DoubleSide}
        />
      </mesh>
      {/* Collar leaves — the two flaps opening into the V. */}
      {([1, -1] as const).map((side) => (
        <mesh
          key={side}
          position={[0.51 * side, 1.86, 0.235]}
          rotation={[-0.1, -0.2 * side, 0.7 * side]}
        >
          <boxGeometry args={[0.56, 0.36, 0.045]} />
          <ClothMaterial roughness={0.58} />
        </mesh>
      ))}

      {/* Front placket + pearl buttons. */}
      <mesh position={[0, -0.17, 0.2]}>
        <boxGeometry args={[0.17, 3.5, 0.04]} />
        <ClothMaterial color={CLOTH_SHADE} roughness={0.58} />
      </mesh>
      {buttons.map((y) => (
        <mesh key={y} position={[0, y, 0.228]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.042, 0.042, 0.022, 16]} />
          <meshPhysicalMaterial
            color="#f8fafc"
            roughness={0.22}
            clearcoat={0.7}
            clearcoatRoughness={0.25}
          />
        </mesh>
      ))}

      {/* Chest pocket (wearer's left). */}
      <mesh position={[0.63, 0.92, 0.185]} rotation={[0, 0, -0.02]}>
        <boxGeometry args={[0.46, 0.52, 0.025]} />
        <ClothMaterial color="#f2f6fb" roughness={0.6} />
      </mesh>

      <Sleeve side={1} />
      <Sleeve side={-1} />
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Folded-garment stack                                                */
/* ------------------------------------------------------------------ */

function FoldedStack() {
  // 3 folded garments + 1 striped one (faked with two thin slabs in
  // alternating palette colours — no textures anywhere).
  const layers: {
    y: number;
    h: number;
    color: string;
    x?: number;
    rotY?: number;
  }[] = [
    { y: 0.15, h: 0.3, color: "#ffffff", rotY: 0.05 },
    { y: 0.44, h: 0.28, color: "#c7dcee", x: -0.03, rotY: -0.07 },
    { y: 0.65, h: 0.14, color: "#ffffff", x: 0.02, rotY: 0.03 },
    { y: 0.79, h: 0.14, color: "#a8c4de", x: 0.02, rotY: 0.03 },
    { y: 0.99, h: 0.26, color: "#d7f2ec", x: 0.04, rotY: 0.1 },
  ];
  return (
    <group position={[1.72, -2.32, 0.72]}>
      {layers.map((layer, i) => (
        <RoundedBox
          key={i}
          args={[1.55, layer.h, 1.12]}
          radius={0.06}
          smoothness={4}
          position={[layer.x ?? 0, layer.y, 0]}
          rotation={[0, layer.rotY ?? 0, 0]}
        >
          <meshPhysicalMaterial
            color={layer.color}
            roughness={0.66}
            metalness={0}
            sheen={0.8}
            sheenRoughness={0.6}
            sheenColor="#dbeafe"
            clearcoat={0.1}
            clearcoatRoughness={0.8}
          />
        </RoundedBox>
      ))}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Particles + ground glow (runtime canvas textures — no assets)       */
/* ------------------------------------------------------------------ */

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

function Particles({ count = 110 }: { count?: number }) {
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
        size={0.085}
        map={texture}
        transparent
        opacity={0.5}
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
          [0, "rgba(143,176,212,0.5)"],
          [0.55, "rgba(168,196,222,0.22)"],
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
/* Rig — levitation + pointer parallax                                 */
/* ------------------------------------------------------------------ */

function GarmentGroup() {
  const ref = useRef<THREE.Group | null>(null);
  const pointerTarget = useRef({ x: 0, y: 0 });
  const pointerSmooth = useRef({ x: 0, y: 0 });

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
    group.position.y = Math.sin(t * 0.55) * 0.09;
    group.rotation.y =
      -0.05 + Math.sin(t * 0.22) * 0.07 + pointerSmooth.current.x * 0.16;
    group.rotation.x =
      Math.sin(t * 0.3) * 0.012 + pointerSmooth.current.y * 0.045;
  });

  return (
    <group ref={ref}>
      <group position={[-0.62, 0.18, 0]}>
        <DressShirt />
      </group>
      <FoldedStack />
    </group>
  );
}

function Scene() {
  return (
    <>
      <ambientLight intensity={0.75} />
      <directionalLight position={[4, 6, 6]} intensity={1.15} color="#ffffff" />
      <directionalLight position={[-6, 3, -4]} intensity={0.5} color="#b2e4da" />
      <directionalLight position={[-2, 1, 6]} intensity={0.3} color="#dfeaf5" />
      <GarmentGroup />
      <Particles />
      <PedestalGlow />
      <ContactShadows
        position={[0, -2.33, 0]}
        opacity={0.34}
        scale={12}
        blur={2.8}
        far={4.5}
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
