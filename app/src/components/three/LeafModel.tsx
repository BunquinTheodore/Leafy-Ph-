"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { CanvasTexture, DoubleSide, Group, LinearFilter, MathUtils, SRGBColorSpace } from "three";
import { createLeafGeometry } from "./leaf-geometry";

interface LeafPalette {
  base: string;
  vein: string;
  glow: string;
}

const TEXTURE_SIZE = { width: 512, height: 1024 } as const;
const LATERAL_VEINS = 9;

/** Paints the blade color with a midrib and curved lateral veins (the "lab meets forest" look). */
export function createVeinTexture(palette: LeafPalette): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = TEXTURE_SIZE.width;
  canvas.height = TEXTURE_SIZE.height;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const { width, height } = TEXTURE_SIZE;
    const gradient = ctx.createLinearGradient(0, height, 0, 0);
    gradient.addColorStop(0, palette.base);
    gradient.addColorStop(1, palette.glow);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = palette.vein;
    ctx.lineCap = "round";
    // Canvas y runs top to bottom; uv v=0 is the base, so the base is at the bottom.
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(width / 2, height);
    ctx.lineTo(width / 2, 0);
    ctx.stroke();
    ctx.lineWidth = 3;
    for (let i = 1; i <= LATERAL_VEINS; i += 1) {
      const y = height - (i / (LATERAL_VEINS + 1)) * height * 0.92 - height * 0.03;
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(width / 2, y);
        ctx.quadraticCurveTo(
          width / 2 + side * width * 0.2,
          y - height * 0.03,
          width / 2 + side * width * 0.46,
          y - height * 0.12,
        );
        ctx.stroke();
      }
    }
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.minFilter = LinearFilter;
  return texture;
}

interface LeafModelProps {
  palette: LeafPalette;
  position?: [number, number, number];
  scale?: number;
  /** Lean toward the pointer and sway gently. False renders a still leaf. */
  animated?: boolean;
  mobile?: boolean;
  emissiveIntensity?: number;
}

/**
 * The shared procedural leaf (one geometry, one vein texture) used by the hero, the auth
 * backdrop and the scan scenes. Leans toward the pointer with a damped spring.
 */
export function LeafModel({
  palette,
  position = [0, 0, 0],
  scale = 1,
  animated = true,
  mobile = false,
  emissiveIntensity = 0.35,
}: LeafModelProps) {
  const group = useRef<Group>(null);
  const geometry = useMemo(
    () => (mobile ? createLeafGeometry(8, 20) : createLeafGeometry(16, 40)),
    [mobile],
  );
  const texture = useMemo(() => createVeinTexture(palette), [palette]);

  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => texture.dispose(), [texture]);

  useFrame((state, delta) => {
    const target = group.current;
    if (!target || !animated) return;
    const t = state.clock.elapsedTime;
    const lean = 1 - Math.exp(-3.5 * delta);
    target.rotation.y = MathUtils.lerp(
      target.rotation.y,
      0.5 + state.pointer.x * 0.45 + Math.sin(t * 0.5) * 0.08,
      lean,
    );
    target.rotation.x = MathUtils.lerp(
      target.rotation.x,
      -0.15 - state.pointer.y * 0.3 + Math.sin(t * 0.7) * 0.04,
      lean,
    );
    target.rotation.z = MathUtils.lerp(target.rotation.z, -0.35 + Math.sin(t * 0.4) * 0.05, lean);
    target.position.y = position[1] + Math.sin(t * 0.8) * 0.05;
  });

  return (
    <group ref={group} position={position} scale={scale} rotation={[-0.15, 0.5, -0.35]}>
      <mesh geometry={geometry}>
        <meshStandardMaterial
          map={texture}
          emissiveMap={texture}
          emissive={palette.glow}
          emissiveIntensity={emissiveIntensity}
          roughness={0.5}
          metalness={0}
          side={DoubleSide}
        />
      </mesh>
    </group>
  );
}
