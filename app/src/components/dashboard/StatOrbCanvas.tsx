"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import { Group } from "three";
import { useTheme } from "../layout/theme";
import { LeafModel } from "../three/LeafModel";
import { SceneCanvas } from "../three/SceneCanvas";
import { useIsMobile, useReducedMotion, useSceneColors } from "../three/hooks";
import type { Segment } from "./data";
import { arcsFor, type Arc } from "./orb-math";

const RING_RADIUS = 1.25;
const TUBE_RADIUS = 0.17;
const SPIN_SPEED = 0.25;
const LEAF_SCALE = 0.75;

interface RingColors {
  healthy: string;
  diseased: string;
  unknown: string;
  track: string;
}

function readRingColors(): RingColors {
  const style = getComputedStyle(document.documentElement);
  const read = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
  return {
    healthy: read("--sev-healthy", "#40c057"),
    diseased: read("--sev-high", "#ff7a3d"),
    unknown: read("--info", "#5cc8d0"),
    track: read("--border", "#1e3d2b"),
  };
}

function Ring({ arcs, colors, animated }: { arcs: Arc[]; colors: RingColors; animated: boolean }) {
  const group = useRef<Group>(null);
  useFrame((_, delta) => {
    if (animated && group.current) group.current.rotation.y += delta * SPIN_SPEED;
  });
  return (
    <group ref={group} rotation={[-0.45, 0, 0]}>
      {arcs.length === 0 ? (
        <mesh>
          <torusGeometry args={[RING_RADIUS, TUBE_RADIUS * 0.6, 16, 96]} />
          <meshStandardMaterial color={colors.track} roughness={0.6} />
        </mesh>
      ) : (
        arcs.map((arc) => (
          <mesh key={arc.key} rotation={[0, 0, arc.start - arc.length]}>
            <torusGeometry args={[RING_RADIUS, TUBE_RADIUS, 20, 96, arc.length]} />
            <meshStandardMaterial
              color={colors[arc.key]}
              emissive={colors[arc.key]}
              emissiveIntensity={0.25}
              roughness={0.4}
              metalness={0.1}
            />
          </mesh>
        ))
      )}
    </group>
  );
}

function Repaint({ dependency }: { dependency: unknown }) {
  const invalidate = useThree((state) => state.invalidate);
  useEffect(() => invalidate(), [dependency, invalidate]);
  return null;
}

/** The 3D result orb: a ring split by outcome around the shared procedural leaf. */
export default function StatOrbCanvas({
  segments,
  onReady,
}: {
  segments: readonly Segment[];
  onReady: () => void;
}) {
  const theme = useTheme();
  const scene = useSceneColors();
  const mobile = useIsMobile();
  const reduced = useReducedMotion();
  const animated = !reduced;
  const [colors, setColors] = useState<RingColors | null>(null);
  useEffect(() => setColors(readRingColors()), [theme]);
  const arcs = useMemo(() => arcsFor(segments), [segments]);
  const palette = scene.dark
    ? { base: scene.deep, vein: scene.glow, glow: scene.brand }
    : { base: scene.brand, vein: "#e6f7e9", glow: scene.glow };

  if (!colors) return null;
  return (
    <SceneCanvas
      fallback={null}
      onReady={onReady}
      animated={animated}
      camera={{ position: [0, 0, 5.4], fov: 35 }}
    >
      <Repaint dependency={`${theme}|${arcs.length}`} />
      <ambientLight intensity={scene.dark ? 0.7 : 1.2} />
      <directionalLight position={[3, 4, 5]} intensity={scene.dark ? 2.2 : 1.8} />
      <pointLight position={[-3, 1, 2]} color={scene.glow} intensity={scene.dark ? 30 : 10} />
      <Ring arcs={arcs} colors={colors} animated={animated} />
      <LeafModel
        palette={palette}
        scale={LEAF_SCALE}
        animated={animated}
        mobile={mobile}
        emissiveIntensity={scene.dark ? 0.4 : 0.12}
      />
    </SceneCanvas>
  );
}
