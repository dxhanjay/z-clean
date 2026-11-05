"use client";

import dynamic from "next/dynamic";
import { Component, useEffect, useState, type ReactNode } from "react";
import HeroVisual from "./HeroVisual";
import { heroRenderMode, type HeroRenderMode } from "@/lib/motion";

/**
 * Hero visual selector (Phase 5, Scope M).
 *
 * The homepage hero ships the static photo composition
 * (HeroVisual) by default — it is what renders on the server, what
 * reduced-motion visitors keep, what devices without WebGL keep,
 * and what everyone sees while the 3D chunk loads. The WebGL
 * scene (HeroScene3D) is a progressive enhancement layered on top
 * only when src/lib/motion.ts's rule says yes: WebGL available AND
 * no reduced-motion preference. A scene that throws or fails to
 * initialise falls straight back to the static composition via
 * the error boundary / onError path — the hero can never be a
 * blank box. three.js arrives in a next/dynamic chunk that only
 * this page ever requests.
 */

const HeroScene3D = dynamic(() => import("./HeroScene3D"), {
  ssr: false,
  loading: () => <HeroVisual />,
});

class SceneErrorBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function detectWebGLSupport(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(
      window.WebGLRenderingContext &&
        (canvas.getContext("webgl2") || canvas.getContext("webgl")),
    );
  } catch {
    return false;
  }
}

export default function HeroShowcase() {
  const [mode, setMode] = useState<HeroRenderMode>("static");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setMode(
      heroRenderMode({
        webglSupported: detectWebGLSupport(),
        prefersReducedMotion: window.matchMedia(
          "(prefers-reduced-motion: reduce)",
        ).matches,
      }),
    );
  }, []);

  if (mode !== "canvas" || failed) return <HeroVisual />;

  return (
    <SceneErrorBoundary fallback={<HeroVisual />}>
      <HeroScene3D onError={() => setFailed(true)} />
    </SceneErrorBoundary>
  );
}
