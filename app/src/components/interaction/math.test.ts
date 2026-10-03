import { describe, expect, it } from "vitest";
import { clamp, damp, effectsAllowed, magneticOffset, pointerFraction, shift } from "./math";

describe("clamp", () => {
  it("limits values to the range", () => {
    expect(clamp(5, 0, 1)).toBe(1);
    expect(clamp(-5, 0, 1)).toBe(0);
    expect(clamp(0.4, 0, 1)).toBe(0.4);
  });
});

describe("pointerFraction", () => {
  const rect = { left: 100, top: 50, width: 200, height: 100 };

  it("maps a point inside the element to 0..1", () => {
    expect(pointerFraction(200, 100, rect)).toEqual({ x: 0.5, y: 0.5 });
    expect(pointerFraction(100, 50, rect)).toEqual({ x: 0, y: 0 });
  });

  it("clamps points outside the element", () => {
    expect(pointerFraction(-1000, 9999, rect)).toEqual({ x: 0, y: 1 });
  });

  it("returns the center for zero sized elements", () => {
    expect(pointerFraction(5, 5, { left: 0, top: 0, width: 0, height: 0 })).toEqual({
      x: 0.5,
      y: 0.5,
    });
  });
});

describe("magneticOffset", () => {
  const opts = { radius: 80, strength: 0.3, max: 6 };

  it("pulls toward the pointer inside the radius", () => {
    const offset = magneticOffset(20, -10, opts);
    expect(offset.x).toBeCloseTo(6 * Math.tanh((20 * 0.3) / 6), 5);
    expect(offset.x).toBeGreaterThan(0);
    expect(offset.y).toBeLessThan(0);
  });

  it("never exceeds the maximum drift", () => {
    const offset = magneticOffset(79, 0, { radius: 80, strength: 5, max: 6 });
    expect(Math.abs(offset.x)).toBeLessThanOrEqual(6);
  });

  it("is zero outside the radius", () => {
    expect(magneticOffset(200, 0, opts)).toEqual({ x: 0, y: 0 });
  });
});

describe("damp", () => {
  it("moves toward the target without overshooting", () => {
    const next = damp(0, 10, 8, 1 / 60);
    expect(next).toBeGreaterThan(0);
    expect(next).toBeLessThan(10);
  });

  it("is frame rate independent in direction and converges", () => {
    let value = 0;
    for (let i = 0; i < 600; i += 1) value = damp(value, 10, 8, 1 / 60);
    expect(value).toBeCloseTo(10, 3);
  });

  it("does not move when dt is zero", () => {
    expect(damp(3, 10, 8, 0)).toBe(3);
  });
});

describe("shift", () => {
  it("scales a 0..1 fraction to a centered pixel shift", () => {
    expect(shift(0.5, 14)).toBe(0);
    expect(shift(1, 14)).toBe(7);
    expect(shift(0, 14)).toBe(-7);
  });
});

describe("effectsAllowed", () => {
  const on = { finePointer: true, reducedMotion: false, effectsOff: false };

  it("allows effects for a mouse with motion enabled", () => {
    expect(effectsAllowed(on)).toBe(true);
  });

  it.each([{ finePointer: false }, { reducedMotion: true }, { effectsOff: true }])(
    "blocks effects when %j",
    (override) => {
      expect(effectsAllowed({ ...on, ...override })).toBe(false);
    },
  );
});
