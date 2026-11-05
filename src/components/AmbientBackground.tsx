/**
 * Ambient glass backdrop (glass + 3D scroll pass) — a fixed,
 * full-viewport pastel wash with large soft colour orbs, mounted
 * by SiteChrome on the public marketing routes only. Admin, staff
 * and the customer task flows never see it: their surfaces stay
 * crisp and solid exactly as before.
 *
 * Performance contract:
 *  - The orbs are radial gradients (their edges are soft by
 *    construction), so this full-screen layer uses NO blur filter
 *    — a viewport-sized backdrop blur is the one effect that would
 *    punish low-end GPUs. backdrop-filter is reserved for the
 *    bounded glass surfaces (header, cards, chips) above it.
 *  - Parallax (homepage ParallaxRoot) translates the .ambient-orb
 *    WRAPPERS via their data-parallax speed; the slow drift
 *    animation lives on the inner element, so the two transforms
 *    never fight over the same node.
 *  - Purely decorative: aria-hidden, pointer-events none, and the
 *    whole layer is still (no drift) under prefers-reduced-motion.
 */

import type { CSSProperties } from "react";

const ORBS: {
  className: string;
  drift: string;
  speed: number;
  style: CSSProperties;
}[] = [
  {
    className: "ambient-orb--sky",
    drift: "ambient-drift-a",
    speed: 0.05,
    style: { width: "58vmax", height: "58vmax", top: "-22vmax", right: "-14vmax" },
  },
  {
    className: "ambient-orb--teal",
    drift: "ambient-drift-b",
    speed: 0.09,
    style: { width: "44vmax", height: "44vmax", top: "26vh", left: "-16vmax" },
  },
  {
    className: "ambient-orb--blush",
    drift: "ambient-drift-c",
    speed: 0.06,
    style: { width: "40vmax", height: "40vmax", top: "58vh", right: "-10vmax" },
  },
  {
    className: "ambient-orb--mist",
    drift: "ambient-drift-a",
    speed: 0.11,
    style: { width: "36vmax", height: "36vmax", top: "96vh", left: "18vw" },
  },
];

export default function AmbientBackground() {
  return (
    <div aria-hidden="true" className="ambient-bg">
      {ORBS.map((orb, i) => (
        <div
          key={i}
          className="ambient-orb"
          style={orb.style}
          data-parallax={orb.speed}
        >
          <div className={`ambient-orb-drift ${orb.className} ${orb.drift}`} />
        </div>
      ))}
    </div>
  );
}
