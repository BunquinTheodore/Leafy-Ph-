"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import type { AccentVariant } from "./AccentSceneCanvas";
import { scenesSuppressed } from "../three/deferred-mount";
import { useInView } from "./useInView";

const AccentSceneCanvas = dynamic(() => import("./AccentSceneCanvas"), { ssr: false });

const IDLE_TIMEOUT_MS = 800;
/** Lets the previous panel's canvas release the single WebGL slot first. */
const HANDOFF_DELAY_MS = 350;

/**
 * Decorative three.js scene in its own cell beside a landing heading. The poster is real HTML/CSS; the canvas
 * mounts only while the panel is on screen and unmounts when it leaves, so there is one
 * WebGL context at a time. Hidden below 960px by CSS.
 */
export function AccentScene({ variant }: { variant: AccentVariant }) {
  const host = useRef<HTMLDivElement>(null);
  const visible = useInView(host, 0.6);
  const [mounted, setMounted] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!visible || scenesSuppressed()) {
      setMounted(false);
      setReady(false);
      return;
    }
    let cancelled = false;
    let idleHandle: number | undefined;
    const timer = window.setTimeout(() => {
      const start = () => {
        if (!cancelled) setMounted(true);
      };
      if (typeof window.requestIdleCallback === "function") {
        idleHandle = window.requestIdleCallback(start, { timeout: IDLE_TIMEOUT_MS });
      } else {
        start();
      }
    }, HANDOFF_DELAY_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      if (idleHandle !== undefined) window.cancelIdleCallback(idleHandle);
    };
  }, [visible]);

  return (
    <div
      ref={host}
      className="lp-scene decor-cell"
      data-decor
      data-ready={ready}
      aria-hidden="true"
    >
      <div className="lp-scene__poster" />
      <div className="lp-scene__canvas">
        {mounted ? <AccentSceneCanvas variant={variant} onReady={() => setReady(true)} /> : null}
      </div>
    </div>
  );
}
