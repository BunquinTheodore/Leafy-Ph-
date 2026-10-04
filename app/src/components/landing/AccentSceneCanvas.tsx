"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { AdditiveBlending, CanvasTexture, DoubleSide, type Mesh } from "three";
import { useMediaQuery } from "../interaction/hooks";
import { FloatingLeaves } from "../three/FloatingLeaves";
import { LeafModel } from "../three/LeafModel";
import { SceneCanvas } from "../three/SceneCanvas";
import { useIsMobile, useReducedMotion, useSceneColors, type SceneColors } from "../three/hooks";

/** beam: leaf with the scanning beam. drift: leaf and drifting leaves. leaves: drifting leaves only. */
export type AccentVariant = "beam" | "drift" | "leaves";

const BEAM_TRAVEL = 0.9;
const BEAM_SPEED = 0.9;

function Repaint({ colors }: { colors: SceneColors }) {
  const invalidate = useThree((state) => state.invalidate);
  useEffect(() => invalidate(), [colors, invalidate]);
  return null;
}

const BEAM_WIDTH = 1.15;
const HALO_HEIGHT = 0.45;

/** Soft vertical falloff for the beam glow: clear at the edges, bright in the middle. */
function createHaloTexture(): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 4;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const gradient = ctx.createLinearGradient(0, 0, 0, 64);
    gradient.addColorStop(0, "rgba(255,255,255,0)");
    gradient.addColorStop(0.5, "rgba(255,255,255,1)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 4, 64);
  }
  return new CanvasTexture(canvas);
}

/** The scanning beam: a thin additive plane sweeping over the leaf (the signature interaction). */
function ScanBeam({ color, animated, size }: { color: string; animated: boolean; size: number }) {
  const bar = useRef<Mesh>(null);
  const halo = useRef<Mesh>(null);
  const haloTexture = useMemo(createHaloTexture, []);
  useEffect(() => () => haloTexture.dispose(), [haloTexture]);
  useFrame(({ clock }) => {
    if (!animated) return;
    const y = Math.sin(clock.elapsedTime * BEAM_SPEED) * BEAM_TRAVEL * size;
    if (bar.current) bar.current.position.y = y;
    if (halo.current) halo.current.position.y = y;
  });
  return (
    <group position={[0, 0, 0.35]}>
      <mesh ref={bar} position={[0, 0.2 * size, 0]}>
        <planeGeometry args={[size * BEAM_WIDTH, 0.025]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.9}
          blending={AdditiveBlending}
          depthWrite={false}
          side={DoubleSide}
        />
      </mesh>
      <mesh ref={halo} position={[0, 0.2 * size, 0]}>
        <planeGeometry args={[size * BEAM_WIDTH, HALO_HEIGHT]} />
        <meshBasicMaterial
          color={color}
          map={haloTexture}
          transparent
          opacity={0.35}
          blending={AdditiveBlending}
          depthWrite={false}
          side={DoubleSide}
        />
      </mesh>
    </group>
  );
}

function AccentLeaf({
  colors,
  animated,
  variant,
}: {
  colors: SceneColors;
  animated: boolean;
  variant: AccentVariant;
}) {
  const viewport = useThree((state) => state.viewport);
  const palette = useMemo(
    () =>
      colors.dark
        ? { base: colors.deep, vein: colors.glow, glow: colors.brand }
        : { base: colors.brand, vein: "#e6f7e9", glow: colors.glow },
    [colors],
  );
  const scale = Math.min(viewport.height * 0.36, viewport.width * 0.3);
  const x = viewport.width * (variant === "beam" ? 0.24 : 0.27);
  return (
    <group position={[x, 0, 0]}>
      <LeafModel
        palette={palette}
        scale={scale}
        animated={animated}
        emissiveIntensity={colors.dark ? 0.4 : 0.12}
      />
      {variant === "beam" ? (
        <ScanBeam color={colors.glow} animated={animated} size={scale} />
      ) : null}
    </group>
  );
}

/** Secondary landing scene: the shared leaf, forest light and drifting leaves, locked to the tokens. */
export default function AccentSceneCanvas({
  variant,
  onReady,
}: {
  variant: AccentVariant;
  onReady: () => void;
}) {
  const colors = useSceneColors();
  const mobile = useIsMobile();
  const wide = useMediaQuery("(min-width: 900px)");
  const reducedMotion = useReducedMotion();
  const animated = !reducedMotion;

  return (
    <SceneCanvas
      fallback={null}
      onReady={onReady}
      animated={animated}
      camera={{ position: [0, 0, 5], fov: 35 }}
    >
      <Repaint colors={colors} />
      <fog attach="fog" args={[colors.bg, 6, 15]} />
      <ambientLight intensity={colors.dark ? 0.55 : 1.15} />
      <directionalLight position={[3, 4, 5]} intensity={colors.dark ? 2.4 : 2} />
      <pointLight
        position={[-3, 1.5, -1.5]}
        color={colors.glow}
        intensity={colors.dark ? 40 : 12}
        distance={14}
      />
      {wide && variant !== "leaves" ? (
        <AccentLeaf colors={colors} animated={animated} variant={variant} />
      ) : null}
      <FloatingLeaves
        count={mobile ? 6 : variant === "beam" ? 10 : 16}
        seed={variant === "beam" ? 5 : 23}
        colors={colors}
        animated={animated}
      />
    </SceneCanvas>
  );
}
