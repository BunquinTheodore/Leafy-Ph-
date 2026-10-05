"use client";

import dynamic from "next/dynamic";
import { useRef, useState } from "react";
import { LogoMark } from "../brand/Logo";
import { useDeferredMount } from "../three/deferred-mount";
import { useInView } from "./useInView";

const HeroSceneCanvas = dynamic(() => import("./HeroSceneCanvas"), { ssr: false });

/**
 * The hero leaf scene (its own grid cell, decoration only). A static poster (mark and glow) is always in the HTML as the LCP safe
 * layer; the three.js canvas loads once the page has settled and fades in over it. No WebGL keeps the poster.
 */
export function HeroScene() {
  const host = useRef<HTMLDivElement>(null);
  const visible = useInView(host, 0.5);
  const idle = useDeferredMount();
  const [ready, setReady] = useState(false);
  // Sideways panels: the canvas lives only while the hero is on screen (one WebGL context at a time).
  const mounted = idle && visible;

  return (
    <div
      ref={host}
      className="hero__scene decor-cell"
      data-decor
      data-ready={ready && mounted}
      aria-hidden="true"
    >
      <div className="hero__poster">
        <LogoMark height={300} />
      </div>
      <div className="hero__canvas">
        {mounted ? <HeroSceneCanvas onReady={() => setReady(true)} /> : null}
      </div>
    </div>
  );
}
