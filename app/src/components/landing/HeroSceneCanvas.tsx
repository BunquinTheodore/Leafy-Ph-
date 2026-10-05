"use client";

import { useThree } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import { FloatingLeaves } from "../three/FloatingLeaves";
import { LeafModel } from "../three/LeafModel";
import { SceneCanvas } from "../three/SceneCanvas";
import { useIsMobile, useReducedMotion, useSceneColors, type SceneColors } from "../three/hooks";

const DESKTOP_LEAVES = 22;
const MOBILE_LEAVES = 9;

function leafPalette(colors: SceneColors) {
  return colors.dark
    ? { base: colors.deep, vein: colors.glow, glow: colors.brand }
    : { base: colors.brand, vein: "#e6f7e9", glow: colors.glow };
}

/** Re-renders on demand when the theme palette changes (reduced motion keeps the loop idle). */
function Repaint({ colors }: { colors: SceneColors }) {
  const invalidate = useThree((state) => state.invalidate);
  useEffect(() => invalidate(), [colors, invalidate]);
  return null;
}

function HeroLeaf({
  colors,
  mobile,
  animated,
}: {
  colors: SceneColors;
  mobile: boolean;
  animated: boolean;
}) {
  const viewport = useThree((state) => state.viewport);
  const palette = useMemo(() => leafPalette(colors), [colors]);
  // The scene owns its own cell, so the leaf sits in the middle of it.
  const scale = Math.min(viewport.height * 0.15, viewport.width * 0.2);
  const position: [number, number, number] = [0, 0, 0];
  return (
    <LeafModel
      palette={palette}
      position={position}
      scale={scale}
      animated={animated}
      mobile={mobile}
      emissiveIntensity={colors.dark ? 0.4 : 0.12}
    />
  );
}

/** Hero scene: interactive leaf, drifting leaves, forest lighting and fog locked to the tokens. */
export default function HeroSceneCanvas({ onReady }: { onReady: () => void }) {
  const colors = useSceneColors();
  const mobile = useIsMobile();
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
      <HeroLeaf colors={colors} mobile={mobile} animated={animated} />
      <FloatingLeaves
        count={mobile ? MOBILE_LEAVES : DESKTOP_LEAVES}
        colors={colors}
        animated={animated}
      />
    </SceneCanvas>
  );
}
