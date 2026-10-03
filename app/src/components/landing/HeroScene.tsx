"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { LogoMark } from "../brand/Logo";

const HeroSceneCanvas = dynamic(() => import("./HeroSceneCanvas"), { ssr: false });

const IDLE_TIMEOUT_MS = 1200;

/**
 * The hero background. A static poster (mark and glow) is always in the HTML as the LCP safe
 * layer; the three.js canvas loads after idle and fades in over it. No WebGL keeps the poster.
 */
export function HeroScene() {
  const [mounted, setMounted] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (typeof window.requestIdleCallback === "function") {
      const handle = window.requestIdleCallback(() => setMounted(true), {
        timeout: IDLE_TIMEOUT_MS,
      });
      return () => window.cancelIdleCallback(handle);
    }
    const timer = window.setTimeout(() => setMounted(true), 300);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div className="hero__scene" data-ready={ready} aria-hidden="true">
      <div className="hero__poster">
        <LogoMark height={300} />
      </div>
      <div className="hero__canvas">
        {mounted ? <HeroSceneCanvas onReady={() => setReady(true)} /> : null}
      </div>
    </div>
  );
}
