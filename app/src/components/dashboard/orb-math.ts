import type { Segment } from "./data";

export const START_ANGLE = Math.PI / 2;
export const FULL_TURN = Math.PI * 2;
export const GAP_RADIANS = 0.09;

export interface Arc {
  key: Segment["key"];
  /** Angle (radians, counter clockwise from +x) where the arc starts, travelling clockwise. */
  start: number;
  length: number;
}

/**
 * Arc layout for the 3D ring: every non empty segment gets its share of the circle minus the
 * gaps between neighbours. Arcs run clockwise from the top.
 */
export function arcsFor(segments: readonly Segment[]): Arc[] {
  const visible = segments.filter((segment) => segment.fraction > 0);
  const gap = visible.length > 1 ? GAP_RADIANS : 0;
  const usable = FULL_TURN - visible.length * gap;
  let cursor = START_ANGLE;
  return visible.map((segment) => {
    const length = segment.fraction * usable;
    const arc: Arc = { key: segment.key, start: cursor, length };
    cursor -= length + gap;
    return arc;
  });
}
