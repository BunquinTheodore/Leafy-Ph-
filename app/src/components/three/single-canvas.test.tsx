import { act, render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useSingleActiveCanvas } from "./hooks";

function Probe({ id, onActive }: { id: string; onActive: (active: boolean) => void }) {
  onActive(useSingleActiveCanvas(id));
  return null;
}

describe("useSingleActiveCanvas", () => {
  it("lets only one canvas be active and hands the slot to the next when it leaves", () => {
    let first = false;
    let second = false;
    const view = render(
      <>
        <Probe id="first" onActive={(value) => (first = value)} />
        <Probe id="second" onActive={(value) => (second = value)} />
      </>,
    );
    expect(first).toBe(true);
    expect(second).toBe(false);

    act(() => {
      view.rerender(<Probe id="second" onActive={(value) => (second = value)} />);
    });
    expect(second).toBe(true);
  });

  it("does not leave the slot claimed after the last canvas unmounts", () => {
    let probeActive = false;
    const view = render(<Probe id="only" onActive={(value) => (probeActive = value)} />);
    expect(probeActive).toBe(true);
    view.unmount();

    let next = false;
    render(<Probe id="next" onActive={(value) => (next = value)} />);
    expect(next).toBe(true);
  });
});
