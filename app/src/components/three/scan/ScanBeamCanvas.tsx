"use client";

import type { ReactNode } from "react";
import type { StepId } from "@/lib/scans/stages";
import { SceneCanvas } from "../SceneCanvas";
import { Ready } from "./Ready";
import { ScanBeamScene } from "./ScanBeamScene";

interface ScanBeamCanvasProps {
  photoUrl: string | null;
  step: StepId;
  fallback: ReactNode;
  onReady: () => void;
}

/** Loaded on demand (next/dynamic, no SSR). One WebGL canvas, with the flat photo as fallback. */
export default function ScanBeamCanvas({ photoUrl, step, fallback, onReady }: ScanBeamCanvasProps) {
  return (
    <SceneCanvas
      className="scan-canvas"
      fallback={fallback}
      camera={{ position: [0, 0, 4.4], fov: 35 }}
    >
      <ScanBeamScene photoUrl={photoUrl} step={step} />
      <Ready onReady={onReady} />
    </SceneCanvas>
  );
}
