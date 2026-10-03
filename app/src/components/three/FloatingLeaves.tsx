"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { Color, DoubleSide, Group, InstancedMesh, MathUtils, Object3D } from "three";
import { FIELD_BOUNDS, createLeafField, createLeafGeometry } from "./leaf-geometry";

interface FloatingLeavesProps {
  count?: number;
  seed?: number;
  colors: { deep: string; brand: string; glow: string };
  /** Drift and pointer parallax. False draws the leaves once. */
  animated?: boolean;
}

const dummy = new Object3D();

/** Instanced drifting leaves (one draw call) with depth and gentle pointer parallax. */
export function FloatingLeaves({
  count = 24,
  seed = 11,
  colors,
  animated = true,
}: FloatingLeavesProps) {
  const mesh = useRef<InstancedMesh>(null);
  const group = useRef<Group>(null);
  const geometry = useMemo(() => createLeafGeometry(4, 8), []);
  const leaves = useMemo(() => createLeafField(count, seed), [count, seed]);
  const state = useRef(leaves.map((leaf) => ({ ...leaf })));

  useEffect(() => {
    state.current = leaves.map((leaf) => ({ ...leaf }));
  }, [leaves]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  useEffect(() => {
    const target = mesh.current;
    if (!target) return;
    const palette = [new Color(colors.deep), new Color(colors.brand), new Color(colors.glow)];
    leaves.forEach((leaf, index) => {
      const slot = Math.min(2, Math.floor(leaf.tint * 3));
      target.setColorAt(index, palette[slot] ?? palette[1]!);
    });
    if (target.instanceColor) target.instanceColor.needsUpdate = true;
  }, [colors.brand, colors.deep, colors.glow, leaves]);

  const write = (delta: number, time: number) => {
    const target = mesh.current;
    if (!target) return;
    state.current.forEach((leaf, index) => {
      if (delta > 0) {
        leaf.y -= leaf.fall * delta;
        leaf.rotX += leaf.spinX * delta;
        leaf.rotY += leaf.spinY * delta;
        leaf.rotZ += leaf.spinZ * delta;
        if (leaf.y < -FIELD_BOUNDS.y) leaf.y = FIELD_BOUNDS.y;
      }
      dummy.position.set(leaf.x + Math.sin(time * leaf.sway + leaf.phase) * 0.25, leaf.y, leaf.z);
      dummy.rotation.set(leaf.rotX, leaf.rotY, leaf.rotZ);
      dummy.scale.setScalar(leaf.scale);
      dummy.updateMatrix();
      target.setMatrixAt(index, dummy.matrix);
    });
    target.instanceMatrix.needsUpdate = true;
  };

  useEffect(() => write(0, 0));

  useFrame((frame, delta) => {
    if (!animated) return;
    write(Math.min(delta, 0.05), frame.clock.elapsedTime);
    const parallax = group.current;
    if (parallax) {
      parallax.position.x = MathUtils.lerp(parallax.position.x, frame.pointer.x * 0.35, 0.05);
      parallax.position.y = MathUtils.lerp(parallax.position.y, frame.pointer.y * 0.2, 0.05);
    }
  });

  return (
    <group ref={group}>
      <instancedMesh ref={mesh} args={[geometry, undefined, count]} frustumCulled={false}>
        <meshStandardMaterial roughness={0.6} side={DoubleSide} transparent opacity={0.85} />
      </instancedMesh>
    </group>
  );
}
