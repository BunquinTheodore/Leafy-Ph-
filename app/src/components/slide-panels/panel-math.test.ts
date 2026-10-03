import { describe, expect, it } from "vitest";
import { indexForHash, indexForScroll } from "./panel-math";

describe("indexForScroll", () => {
  it("snaps to the nearest panel", () => {
    expect(indexForScroll(0, 1000, 5)).toBe(0);
    expect(indexForScroll(499, 1000, 5)).toBe(0);
    expect(indexForScroll(501, 1000, 5)).toBe(1);
    expect(indexForScroll(4000, 1000, 5)).toBe(4);
  });

  it("clamps overscroll and handles empty sizes", () => {
    expect(indexForScroll(-300, 1000, 5)).toBe(0);
    expect(indexForScroll(99999, 1000, 5)).toBe(4);
    expect(indexForScroll(100, 0, 5)).toBe(0);
    expect(indexForScroll(100, 1000, 0)).toBe(0);
  });
});

describe("indexForHash", () => {
  const ids = ["overview", "causes", "treatment"];

  it("finds deep links with or without the #", () => {
    expect(indexForHash("#treatment", ids)).toBe(2);
    expect(indexForHash("causes", ids)).toBe(1);
  });

  it("returns null for empty, unknown or malformed hashes", () => {
    expect(indexForHash("", ids)).toBeNull();
    expect(indexForHash("#", ids)).toBeNull();
    expect(indexForHash("#nope", ids)).toBeNull();
    expect(indexForHash("#%E0%A4%A", ids)).toBeNull();
  });
});
