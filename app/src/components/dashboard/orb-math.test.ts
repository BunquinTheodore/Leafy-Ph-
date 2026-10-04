import { describe, expect, it } from "vitest";
import type { Segment } from "./data";
import { FULL_TURN, GAP_RADIANS, START_ANGLE, arcsFor } from "./orb-math";

const seg = (key: Segment["key"], fraction: number): Segment => ({
  key,
  label: key,
  count: 0,
  fraction,
});

describe("arcsFor", () => {
  it("returns no arcs when there is nothing to show", () => {
    expect(arcsFor([seg("healthy", 0), seg("diseased", 0), seg("unknown", 0)])).toEqual([]);
  });

  it("gives a single segment the whole ring without a gap", () => {
    const [arc] = arcsFor([seg("healthy", 1), seg("diseased", 0), seg("unknown", 0)]);
    expect(arc?.key).toBe("healthy");
    expect(arc?.start).toBeCloseTo(START_ANGLE);
    expect(arc?.length).toBeCloseTo(FULL_TURN);
  });

  it("fills the circle minus the gaps and runs clockwise from the top", () => {
    const arcs = arcsFor([seg("healthy", 0.5), seg("diseased", 0.3), seg("unknown", 0.2)]);
    expect(arcs.map((arc) => arc.key)).toEqual(["healthy", "diseased", "unknown"]);
    const total = arcs.reduce((sum, arc) => sum + arc.length, 0);
    expect(total + arcs.length * GAP_RADIANS).toBeCloseTo(FULL_TURN);
    expect(arcs[1]?.start).toBeCloseTo(
      (arcs[0]?.start ?? 0) - (arcs[0]?.length ?? 0) - GAP_RADIANS,
    );
  });

  it("skips empty segments", () => {
    const arcs = arcsFor([seg("healthy", 0.6), seg("diseased", 0), seg("unknown", 0.4)]);
    expect(arcs.map((arc) => arc.key)).toEqual(["healthy", "unknown"]);
  });
});
