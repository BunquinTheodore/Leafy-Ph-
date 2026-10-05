"use client";

import type { ReactNode } from "react";
import { SceneCanvas } from "../SceneCanvas";
import { Ready } from "./Ready";
import { LeafOrbitScene } from "./LeafOrbitScene";

interface LeafOrbitCanvasProps {
  photoUrl: string;
  scanId: string;
  markerColor: string;
  coarsePointer: boolean;
  showMarker: boolean;
  fallback: ReactNode;
  onReady: () => void;
}

/** Loaded on demand (next/dynamic, no SSR). The flat photo stays as the fallback. */
export default function LeafOrbitCanvas({ fallback, onReady, ...scene }: LeafOrbitCanvasProps) {
  return (
    <SceneCanvas
      className="scan-canvas"
      fallback={fallback}
      camera={{ position: [0, 0, 3.3], fov: 35 }}
    >
      <LeafOrbitScene {...scene} />
      <Ready onReady={onReady} />
    </SceneCanvas>
  );
}
