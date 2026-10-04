import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatCountdown, useCountdown } from "./countdown";

describe("formatCountdown", () => {
  it("shows minutes and zero padded seconds", () => {
    expect(formatCountdown(0)).toBe("0:00");
    expect(formatCountdown(9)).toBe("0:09");
    expect(formatCountdown(42)).toBe("0:42");
    expect(formatCountdown(60)).toBe("1:00");
    expect(formatCountdown(125)).toBe("2:05");
  });
  it("never goes negative or fractional", () => {
    expect(formatCountdown(-3)).toBe("0:00");
    expect(formatCountdown(4.2)).toBe("0:05");
  });
});

describe("useCountdown", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("counts down once a second and stops at zero", () => {
    const { result } = renderHook(() => useCountdown());
    expect(result.current.remaining).toBe(0);
    act(() => result.current.start(3));
    expect(result.current.remaining).toBe(3);
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current.remaining).toBe(2);
    act(() => vi.advanceTimersByTime(5000));
    expect(result.current.remaining).toBe(0);
  });

  it("restarts with a new value", () => {
    const { result } = renderHook(() => useCountdown());
    act(() => result.current.start(10));
    act(() => vi.advanceTimersByTime(4000));
    act(() => result.current.start(60));
    expect(result.current.remaining).toBe(60);
  });
});
