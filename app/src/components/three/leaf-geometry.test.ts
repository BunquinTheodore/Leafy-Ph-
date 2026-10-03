import { describe, expect, it } from "vitest";
import { createLeafField, createLeafGeometry, leafHalfWidth } from "./leaf-geometry";

describe("leafHalfWidth", () => {
  it("is zero at the tip and the base and widest in the middle", () => {
    expect(leafHalfWidth(0)).toBeCloseTo(0, 5);
    expect(leafHalfWidth(1)).toBeCloseTo(0, 5);
    const mid = leafHalfWidth(0.45);
    expect(mid).toBeGreaterThan(leafHalfWidth(0.1));
    expect(mid).toBeGreaterThan(leafHalfWidth(0.9));
  });
});

describe("createLeafGeometry", () => {
  const geometry = createLeafGeometry(8, 20);
  const position = geometry.getAttribute("position");

  it("builds a grid of vertices with uvs and normals", () => {
    expect(position.count).toBe(9 * 21);
    expect(geometry.getAttribute("uv").count).toBe(position.count);
    expect(geometry.getAttribute("normal").count).toBe(position.count);
    expect(geometry.index?.count).toBe(8 * 20 * 6);
  });

  it("never produces NaN positions", () => {
    for (let i = 0; i < position.array.length; i += 1)
      expect(Number.isFinite(position.array[i])).toBe(true);
  });

  it("fits a bounded box, taller than wide, folded along the midrib", () => {
    geometry.computeBoundingBox();
    const box = geometry.boundingBox;
    expect(box).not.toBeNull();
    if (!box) return;
    const height = box.max.y - box.min.y;
    const width = box.max.x - box.min.x;
    expect(height).toBeGreaterThan(width);
    expect(box.max.z - box.min.z).toBeGreaterThan(0.05);
  });

  it("stays within the triangle budget for mobile", () => {
    const high = createLeafGeometry(16, 40);
    expect((high.index?.count ?? 0) / 3).toBeLessThan(2000);
  });
});

describe("createLeafField", () => {
  it("is deterministic for a seed", () => {
    expect(createLeafField(12, 7)).toEqual(createLeafField(12, 7));
    expect(createLeafField(12, 7)).not.toEqual(createLeafField(12, 8));
  });

  it("keeps leaves inside the bounds with positive speeds", () => {
    const leaves = createLeafField(40, 3);
    expect(leaves).toHaveLength(40);
    for (const leaf of leaves) {
      expect(Math.abs(leaf.x)).toBeLessThanOrEqual(7);
      expect(Math.abs(leaf.y)).toBeLessThanOrEqual(4.5);
      expect(leaf.z).toBeLessThanOrEqual(1);
      expect(leaf.z).toBeGreaterThanOrEqual(-8);
      expect(leaf.fall).toBeGreaterThan(0);
      expect(leaf.scale).toBeGreaterThan(0);
    }
  });
});
