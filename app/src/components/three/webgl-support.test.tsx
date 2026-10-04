import { act, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useWebGLSupport } from "./hooks";

function Probe({
  active,
  onValue,
}: {
  active?: boolean;
  onValue: (value: boolean | null) => void;
}) {
  onValue(useWebGLSupport(active));
  return null;
}

describe("useWebGLSupport", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not create a WebGL context until it is asked to (the probe is slow on software GL)", () => {
    const getContext = vi
      .spyOn(HTMLCanvasElement.prototype, "getContext")
      .mockReturnValue({} as never);
    let seen: boolean | null = true;
    const view = render(<Probe active={false} onValue={(value) => (seen = value)} />);
    expect(getContext).not.toHaveBeenCalled();
    expect(seen).toBeNull();
    act(() => {
      view.rerender(<Probe active onValue={(value) => (seen = value)} />);
    });
    expect(getContext).toHaveBeenCalled();
    expect(seen).toBe(true);
  });

  it("keeps probing right away by default", () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    let seen: boolean | null = null;
    render(<Probe onValue={(value) => (seen = value)} />);
    expect(seen).toBe(false);
  });
});
