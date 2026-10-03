"use client";

import { Canvas } from "@react-three/fiber";
import { Component, Suspense, useId, type ReactNode } from "react";
import { PerfGuard } from "./PerfGuard";
import { useReducedMotion, useSingleActiveCanvas, useWebGLSupport } from "./hooks";

/** The scene is decorative: on any render error fall back to the poster and keep the page working. */
class SceneBoundary extends Component<
  { fallback: ReactNode; children: ReactNode },
  { failed: boolean }
> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

interface SceneCanvasProps {
  children: ReactNode;
  /** Static poster for no WebGL, errors, loading and extra canvases. */
  fallback: ReactNode;
  className?: string;
  /** False for static scenes: renders on demand only. */
  animated?: boolean;
  camera?: { position: [number, number, number]; fov: number };
  onReady?: () => void;
}

/**
 * Shared R3F canvas: client only, DPR capped at 1.5, aria-hidden, error boundary, off screen
 * pause, one active canvas per page, and the poster when WebGL is unavailable.
 */
export function SceneCanvas({
  children,
  fallback,
  className,
  animated = true,
  camera,
  onReady,
}: SceneCanvasProps) {
  const id = useId();
  const supported = useWebGLSupport();
  const reducedMotion = useReducedMotion();
  const isActive = useSingleActiveCanvas(id);

  if (supported !== true || !isActive) return <>{fallback}</>;
  const loop = animated && !reducedMotion;

  return (
    <SceneBoundary fallback={fallback}>
      <Canvas
        className={className}
        aria-hidden="true"
        dpr={[1, 1.5]}
        frameloop={loop ? "always" : "demand"}
        camera={camera ?? { position: [0, 0, 5], fov: 35 }}
        gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
        onCreated={() => onReady?.()}
      >
        <Suspense fallback={null}>
          <PerfGuard animated={loop} />
          {children}
        </Suspense>
      </Canvas>
    </SceneBoundary>
  );
}
