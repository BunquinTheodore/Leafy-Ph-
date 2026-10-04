import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SfxProvider } from "./SfxProvider";

const playSound = vi.fn();
vi.mock("./synth", () => ({ playSound: (...args: unknown[]) => playSound(...args) }));

const constructed = vi.fn();

class FakeAudioContext {
  state = "running";
  constructor() {
    constructed();
  }
  resume() {
    return Promise.resolve();
  }
  suspend() {
    return Promise.resolve();
  }
}

function mouseEvent(type: string): Event {
  const event = new MouseEvent(type, { bubbles: true });
  Object.defineProperty(event, "pointerType", { value: "mouse" });
  return event;
}

describe("SfxProvider", () => {
  beforeEach(() => {
    playSound.mockClear();
    constructed.mockClear();
    vi.stubGlobal("AudioContext", FakeAudioContext);
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query.includes("hover: hover"),
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function setup() {
    const view = render(
      <SfxProvider>
        <button className="btn-primary">Go</button>
      </SfxProvider>,
    );
    return view.getByRole("button");
  }

  it("makes no audio work for hover before the first gesture", async () => {
    const button = setup();
    button.dispatchEvent(mouseEvent("pointerover"));
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(constructed).not.toHaveBeenCalled();
    expect(playSound).not.toHaveBeenCalled();
  });

  it("starts audio after a gesture, once the click has had its frame", async () => {
    const button = setup();
    button.dispatchEvent(mouseEvent("pointerdown"));
    // Not synchronous: the click's own visual feedback paints before any audio work starts.
    expect(constructed).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(playSound).toHaveBeenCalledWith(expect.anything(), "click"));
    expect(constructed).toHaveBeenCalledTimes(1);
  });

  it("plays hover sounds once a gesture has happened", async () => {
    const button = setup();
    button.dispatchEvent(mouseEvent("pointerdown"));
    await vi.waitFor(() => expect(playSound).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => setTimeout(resolve, 320));
    button.dispatchEvent(mouseEvent("pointerover"));
    await vi.waitFor(() => expect(playSound).toHaveBeenCalledWith(expect.anything(), "hover"));
  });
});
