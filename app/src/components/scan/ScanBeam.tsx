"use client";

import dynamic from "next/dynamic";
import { useCallback, useState } from "react";
import type { StepId } from "@/lib/scans/stages";
import { useReducedMotion, useWebGLSupport } from "../three/hooks";

const ScanBeamCanvas = dynamic(() => import("../three/scan/ScanBeamCanvas"), { ssr: false });

interface ScanBeamProps {
  photoUrl: string | null;
  step: StepId;
}

/** Flat photo with a CSS scan line: the poster, and the whole effect when WebGL or motion is off. */
function Poster({ photoUrl, step, still }: ScanBeamProps & { still: boolean }) {
  return (
    <div className="beam-poster" data-step={step} data-still={still || undefined}>
      {photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photoUrl} alt="" decoding="async" />
      ) : (
        <span className="beam-poster__leaf" aria-hidden="true" />
      )}
      {still ? null : <span className="beam-poster__line" aria-hidden="true" />}
    </div>
  );
}

/**
 * The scanning beam, synced to the stage. The canvas is decorative (aria-hidden); the poster is
 * what shows first, with no WebGL, and with reduced motion (a plain photo and no beam).
 */
export function ScanBeam({ photoUrl, step }: ScanBeamProps) {
  const supported = useWebGLSupport();
  const reduced = useReducedMotion();
  const [ready, setReady] = useState(false);
  const onReady = useCallback(() => setReady(true), []);
  const poster = <Poster photoUrl={photoUrl} step={step} still={reduced} />;

  if (reduced || supported !== true) {
    return <div className="beam">{poster}</div>;
  }
  return (
    <div className="beam" data-ready={ready}>
      <div className="beam__poster">{poster}</div>
      <ScanBeamCanvas photoUrl={photoUrl} step={step} fallback={poster} onReady={onReady} />
    </div>
  );
}
