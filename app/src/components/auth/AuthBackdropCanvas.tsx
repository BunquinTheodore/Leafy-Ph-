"use client";

import { useThree } from "@react-three/fiber";
import { useEffect } from "react";
import { FloatingLeaves } from "../three/FloatingLeaves";
import { SceneCanvas } from "../three/SceneCanvas";
import { useIsMobile, useReducedMotion, useSceneColors, type SceneColors } from "../three/hooks";

const DESKTOP_LEAVES = 40;
const MOBILE_LEAVES = 16;
/** Enlarges the leaf field so a few big, well lit leaves read clearly behind the content. */
const FIELD_SCALE = 1.7;

/** Draws again when the theme palette changes (reduced motion keeps the loop on demand). */
function Repaint({ colors }: { colors: SceneColors }) {
  const invalidate = useThree((state) => state.invalidate);
  useEffect(() => invalidate(), [colors, invalidate]);
  return null;
}

/** Low poly leaves drifting through forest fog, locked to the theme tokens. */
export default function AuthBackdropCanvas({ onReady }: { onReady: () => void }) {
  const colors = useSceneColors();
  const mobile = useIsMobile();
  const animated = !useReducedMotion();

  return (
    <SceneCanvas
      fallback={null}
      onReady={onReady}
      animated={animated}
      camera={{ position: [0, 0, 7.5], fov: 40 }}
    >
      <Repaint colors={colors} />
      <fog attach="fog" args={[colors.bg, 8, 24]} />
      <ambientLight intensity={colors.dark ? 0.6 : 1.15} />
      <directionalLight position={[3, 4, 5]} intensity={colors.dark ? 2.2 : 1.8} />
      <pointLight
        position={[-3, 1.5, -1.5]}
        color={colors.glow}
        intensity={colors.dark ? 36 : 10}
        distance={14}
      />
      <group scale={FIELD_SCALE}>
        <FloatingLeaves
          count={mobile ? MOBILE_LEAVES : DESKTOP_LEAVES}
          seed={29}
          colors={colors}
          animated={animated}
        />
      </group>
    </SceneCanvas>
  );
}
