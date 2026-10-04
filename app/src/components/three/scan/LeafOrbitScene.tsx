"use client";

import { OrbitControls } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import type { Group, Mesh } from "three";
import { markerSpot } from "@/lib/scans/panels";
import { damp } from "./beam-params";
import { PhotoPlane, type PlaneSize } from "./PhotoPlane";
import { useSceneColors } from "../hooks";

const MARKER_Z = 0.06;
const PULSE_SPEED = 2.2;

function Marker({ id, size, color }: { id: string; size: PlaneSize; color: string }) {
  const ring = useRef<Mesh>(null);
  const spot = markerSpot(id);

  useFrame((state) => {
    const target = ring.current;
    if (!target) return;
    const pulse = (state.clock.elapsedTime * PULSE_SPEED) % (Math.PI * 2);
    const scale = 1 + Math.sin(pulse) * 0.25 + 0.25;
    target.scale.setScalar(scale);
  });

  return (
    <group position={[spot.x * size.width * 0.5, spot.y * size.height * 0.5, MARKER_Z]}>
      <mesh>
        <sphereGeometry args={[0.06, 24, 24]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.9} />
      </mesh>
      <mesh ref={ring}>
        <ringGeometry args={[0.1, 0.125, 40]} />
        <meshBasicMaterial color={color} transparent opacity={0.8} toneMapped={false} />
      </mesh>
    </group>
  );
}

interface LeafOrbitSceneProps {
  photoUrl: string;
  scanId: string;
  /** CSS color of the severity, so the marker matches the badge. */
  markerColor: string;
  /** True on touch screens: no drag rotation, so swiping the panels still works. */
  coarsePointer: boolean;
  showMarker: boolean;
}

/** The user's photo turned into an orbitable card with a marker for the finding. */
export function LeafOrbitScene({
  photoUrl,
  scanId,
  markerColor,
  coarsePointer,
  showMarker,
}: LeafOrbitSceneProps) {
  const colors = useSceneColors();
  const sway = useRef<Group>(null);

  useFrame((state, delta) => {
    const target = sway.current;
    if (!target || !coarsePointer) return;
    const t = state.clock.elapsedTime;
    target.rotation.y = damp(target.rotation.y, Math.sin(t * 0.6) * 0.4, 3, delta);
  });

  return (
    <>
      <ambientLight intensity={0.9} />
      <directionalLight position={[2, 3, 4]} intensity={0.8} color={colors.glow} />
      <group ref={sway}>
        <PhotoPlane url={photoUrl}>
          {(size) => (showMarker ? <Marker id={scanId} size={size} color={markerColor} /> : null)}
        </PhotoPlane>
      </group>
      <OrbitControls
        makeDefault
        enablePan={false}
        enableZoom={false}
        enableRotate={!coarsePointer}
        enableDamping
        dampingFactor={0.08}
        minPolarAngle={Math.PI * 0.32}
        maxPolarAngle={Math.PI * 0.68}
        minAzimuthAngle={-0.9}
        maxAzimuthAngle={0.9}
      />
    </>
  );
}
