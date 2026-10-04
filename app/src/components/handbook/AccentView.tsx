"use client";

import { PerspectiveCamera, View } from "@react-three/drei";
import { useMemo } from "react";
import { LeafModel } from "../three/LeafModel";
import { useReducedMotion, useSceneColors } from "../three/hooks";
import { accentPalette, type AccentTone } from "./accent-tones";

const LEAF_SCALE = 1.0;

/**
 * Rendered outside the canvas, drei's View draws its own sized div here (the tracked element)
 * and tunnels the scene into the shared canvas behind the page.
 */
export default function AccentView({ tone }: { tone: AccentTone }) {
  const colors = useSceneColors();
  const reducedMotion = useReducedMotion();
  const palette = useMemo(() => accentPalette(tone, colors), [tone, colors]);
  return (
    <View className="leaf-accent__view">
      <PerspectiveCamera makeDefault fov={30} position={[0, 0, 4.2]} />
      <ambientLight intensity={colors.dark ? 0.7 : 1.15} />
      <directionalLight position={[2, 3, 4]} intensity={colors.dark ? 2.2 : 1.8} />
      <pointLight position={[-2, 1, 2]} color={palette.glow} intensity={colors.dark ? 18 : 6} />
      <LeafModel
        palette={palette}
        scale={LEAF_SCALE}
        animated={!reducedMotion}
        mobile
        emissiveIntensity={colors.dark ? 0.4 : 0.15}
      />
    </View>
  );
}
