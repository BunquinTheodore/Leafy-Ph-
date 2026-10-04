"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { LogoMark } from "../brand/Logo";
import { useDeferredMount } from "../three/deferred-mount";
import type { Segment } from "./data";

const StatOrbCanvas = dynamic(() => import("./StatOrbCanvas"), { ssr: false });

const RADIUS = 40;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const GAP = 1.6;

/** Flat donut that is always in the HTML: the poster, and the picture when WebGL is unavailable. */
function Donut({ segments }: { segments: readonly Segment[] }) {
  const visible = segments.filter((segment) => segment.fraction > 0);
  let offset = 0;
  return (
    <svg viewBox="0 0 100 100" className="orb__donut" aria-hidden="true">
      <circle cx="50" cy="50" r={RADIUS} className="orb__track" />
      {visible.map((segment) => {
        const length = Math.max(
          0,
          segment.fraction * CIRCUMFERENCE - (visible.length > 1 ? GAP : 0),
        );
        const node = (
          <circle
            key={segment.key}
            cx="50"
            cy="50"
            r={RADIUS}
            className="orb__seg"
            data-key={segment.key}
            strokeDasharray={`${length} ${CIRCUMFERENCE - length}`}
            strokeDashoffset={-offset}
          />
        );
        offset += segment.fraction * CIRCUMFERENCE;
        return node;
      })}
    </svg>
  );
}

/**
 * Result split as a ring. The donut poster renders on the server; the three.js orb loads once the
 * page has settled and fades in over it. The numbers always live in the legend next to it.
 */
export function StatOrb({ segments }: { segments: readonly Segment[] }) {
  const mounted = useDeferredMount();
  const [ready, setReady] = useState(false);

  return (
    <div className="orb" data-ready={ready} aria-hidden="true">
      <div className="orb__poster">
        <Donut segments={segments} />
        <span className="orb__mark">
          <LogoMark height={34} />
        </span>
      </div>
      <div className="orb__canvas">
        {mounted ? <StatOrbCanvas segments={segments} onReady={() => setReady(true)} /> : null}
      </div>
    </div>
  );
}
