"use client";

import { View } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { SceneCanvas } from "../three/SceneCanvas";

/**
 * Views draw with the scissor test and never clear, so a transparent canvas would smear.
 * One clear per frame, before the views (priority 1) render.
 */
const CLEAR_PRIORITY = 0.5;

function FrameClearer() {
  useFrame(({ gl }) => {
    gl.setScissorTest(false);
    gl.clear(true, true, true);
  }, CLEAR_PRIORITY);
  return null;
}

/** The one shared WebGL canvas for the handbook. Every leaf accent is a drei View into it. */
export default function AccentCanvas() {
  return (
    <SceneCanvas fallback={null} className="handbook-canvas" animated>
      <FrameClearer />
      <View.Port />
    </SceneCanvas>
  );
}
