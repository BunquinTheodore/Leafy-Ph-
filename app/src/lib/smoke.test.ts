import { describe, expect, it } from "vitest";
import { add } from "./smoke";

describe("scaffold smoke test", () => {
  it("adds two numbers", () => {
    expect(add(2, 3)).toBe(5);
  });
});
