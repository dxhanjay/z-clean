"use client";

import dynamic from "next/dynamic";
import {
  Component,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import HeroVisual from "./HeroVisual";
import {
  heroRenderMode,
  heroScrollProgress,
  scrollMotionEnabled,
  setHeroScrollProgress,
  type HeroRenderMode,
} from "@/lib/motion";

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
  const wrapRef = useRef<HTMLDivElement>(null);

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

  // Glass + 3D scroll pass: publish how far the visitor has
  // scrolled through the hero into the module channel in
  // src/lib/motion.ts; the scene's frame loop reads it and turns
  // the garment as the hero leaves. One passive, rAF-throttled
  // listener; reduced-motion visitors never publish (the value
  // stays 0 and the garment keeps its idle motion only).
  useEffect(() => {
    if (
      !scrollMotionEnabled({
        prefersReducedMotion: window.matchMedia(
          "(prefers-reduced-motion: reduce)",
        ).matches,
      })
    ) {
      return;
    }
    const el = wrapRef.current;
    if (!el) return;
    let raf = 0;
    let scheduled = false;
    const update = () => {
      scheduled = false;
      const rect = el.getBoundingClientRect();
      setHeroScrollProgress(
        heroScrollProgress({ heroTop: rect.top, heroHeight: rect.height }),
      );
    };
    const onScroll = () => {
      if (!scheduled) {
        scheduled = true;
        raf = window.requestAnimationFrame(update);
      }
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) window.cancelAnimationFrame(raf);
      setHeroScrollProgress(0);
    };
  }, []);

  return (
    <div ref={wrapRef}>
      {mode !== "canvas" || failed ? (
        <HeroVisual />
      ) : (
        <SceneErrorBoundary fallback={<HeroVisual />}>
          <HeroScene3D onError={() => setFailed(true)} />
        </SceneErrorBoundary>
      )}
    </div>
  );
}
