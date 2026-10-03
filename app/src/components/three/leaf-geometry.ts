import { BufferGeometry, Float32BufferAttribute } from "three";

const LEAF_HEIGHT = 2;
const LEAF_WIDTH_SCALE = 1.25;
const FOLD = 0.45;

/** Half width of the leaf blade at v (0 at the base, 1 at the tip): ovate, with a drawn out tip. */
export function leafHalfWidth(v: number): number {
  const t = Math.min(1, Math.max(0, v));
  const base = Math.sin(Math.PI * t ** 0.8);
  return 0.5 * Math.max(0, base) ** 0.9;
}

/**
 * Procedural leaf: a (segU+1) x (segV+1) grid shaped by the outline, folded along the midrib,
 * with a gentle length wise curve and edge ripple. One geometry feeds the hero leaf, the floating
 * instances and every other scene, so the product shares a single leaf.
 */
export function createLeafGeometry(segU = 16, segV = 40): BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let row = 0; row <= segV; row += 1) {
    const v = row / segV;
    const halfWidth = leafHalfWidth(v) * LEAF_WIDTH_SCALE;
    for (let col = 0; col <= segU; col += 1) {
      const u = (col / segU) * 2 - 1;
      const x = u * halfWidth;
      const y = (v - 0.5) * LEAF_HEIGHT;
      const fold = Math.abs(x) * FOLD;
      const arch = -0.32 * (v - 0.35) ** 2;
      const ripple = Math.sin(v * 11 + u * 2) * 0.012 * Math.abs(u);
      const droop = v > 0.8 ? -((v - 0.8) ** 2) * 0.9 : 0;
      positions.push(x, y, fold + arch + ripple + droop);
      uvs.push((u + 1) / 2, v);
    }
  }

  const stride = segU + 1;
  for (let row = 0; row < segV; row += 1) {
    for (let col = 0; col < segU; col += 1) {
      const a = row * stride + col;
      const b = a + 1;
      const c = a + stride;
      const d = c + 1;
      indices.push(a, b, c, b, d, c);
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

export interface FieldLeaf {
  x: number;
  y: number;
  z: number;
  scale: number;
  rotX: number;
  rotY: number;
  rotZ: number;
  spinX: number;
  spinY: number;
  spinZ: number;
  fall: number;
  sway: number;
  phase: number;
  tint: number;
}

/** Small deterministic PRNG so scenes (and tests) are reproducible. */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const FIELD_BOUNDS = { x: 7, y: 4.5, zMin: -8, zMax: 1 } as const;

/** Initial state for the drifting leaves (positions, spin, fall speed, depth, tint). */
export function createLeafField(count: number, seed: number): FieldLeaf[] {
  const random = mulberry32(seed);
  const between = (min: number, max: number) => min + random() * (max - min);
  return Array.from({ length: count }, () => {
    const z = between(FIELD_BOUNDS.zMin, FIELD_BOUNDS.zMax);
    return {
      x: between(-FIELD_BOUNDS.x, FIELD_BOUNDS.x),
      y: between(-FIELD_BOUNDS.y, FIELD_BOUNDS.y),
      z,
      scale: between(0.12, 0.34) * (1 + (z - FIELD_BOUNDS.zMin) / 18),
      rotX: between(0, Math.PI * 2),
      rotY: between(0, Math.PI * 2),
      rotZ: between(0, Math.PI * 2),
      spinX: between(-0.4, 0.4),
      spinY: between(-0.5, 0.5),
      spinZ: between(-0.3, 0.3),
      fall: between(0.08, 0.3),
      sway: between(0.1, 0.45),
      phase: between(0, Math.PI * 2),
      tint: random(),
    };
  });
}
