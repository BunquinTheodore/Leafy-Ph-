import { describe, expect, it } from "vitest";
import { cooldownDeadline, secondsRemaining } from "./cooldown";

describe("cooldown", () => {
  it("computes a deadline from now", () => {
    expect(cooldownDeadline(1_000, 60)).toBe(61_000);
  });

  it("rounds remaining time up so the label never shows 0 while waiting", () => {
    expect(secondsRemaining(61_000, 1_000)).toBe(60);
    expect(secondsRemaining(61_000, 60_001)).toBe(1);
    expect(secondsRemaining(61_000, 61_000)).toBe(0);
  });

  it("never goes negative and ignores a missing or invalid deadline", () => {
    expect(secondsRemaining(1_000, 5_000)).toBe(0);
    expect(secondsRemaining(null, 5_000)).toBe(0);
    expect(secondsRemaining(Number.NaN, 5_000)).toBe(0);
  });

  it("caps an absurd server supplied wait", () => {
    expect(cooldownDeadline(0, 100_000)).toBe(3_600_000);
  });
});
