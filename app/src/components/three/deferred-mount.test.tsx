import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFERRED_MOUNT_DELAY_MS,
  DEFERRED_MOUNT_IDLE_TIMEOUT_MS,
  scheduleDeferredMount,
  lowPowerDevice,
  scenesSuppressed,
  useDeferredMount,
} from "./deferred-mount";

function setReadyState(value: DocumentReadyState) {
  Object.defineProperty(document, "readyState", { configurable: true, get: () => value });
}

describe("scheduleDeferredMount", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setReadyState("complete");
    // jsdom has no requestIdleCallback: the scheduler falls back to mounting right after the delay.
    vi.stubGlobal("requestIdleCallback", undefined);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("waits for the quiet delay after load before it mounts", () => {
    const onReady = vi.fn();
    scheduleDeferredMount(onReady);
    vi.advanceTimersByTime(DEFERRED_MOUNT_DELAY_MS - 1);
    expect(onReady).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onReady).toHaveBeenCalledTimes(1);
  });

  it("is not hurried by user interaction, so the mount never lands on a click or key press", () => {
    const onReady = vi.fn();
    scheduleDeferredMount(onReady);
    window.dispatchEvent(new Event("pointerdown"));
    window.dispatchEvent(new Event("keydown"));
    vi.advanceTimersByTime(DEFERRED_MOUNT_DELAY_MS - 1);
    expect(onReady).not.toHaveBeenCalled();
  });

  it("starts counting from the load event when the page is still loading", () => {
    setReadyState("loading");
    const onReady = vi.fn();
    scheduleDeferredMount(onReady);
    vi.advanceTimersByTime(DEFERRED_MOUNT_DELAY_MS * 3);
    expect(onReady).not.toHaveBeenCalled();
    window.dispatchEvent(new Event("load"));
    vi.advanceTimersByTime(DEFERRED_MOUNT_DELAY_MS);
    expect(onReady).toHaveBeenCalledTimes(1);
  });

  it("waits for an idle moment after the delay, with a timeout", () => {
    const request = vi.fn(() => 7);
    vi.stubGlobal("requestIdleCallback", request);
    vi.stubGlobal("cancelIdleCallback", vi.fn());
    const onReady = vi.fn();
    scheduleDeferredMount(onReady);
    vi.advanceTimersByTime(DEFERRED_MOUNT_DELAY_MS);
    expect(onReady).not.toHaveBeenCalled();
    expect(request).toHaveBeenCalledWith(expect.any(Function), {
      timeout: DEFERRED_MOUNT_IDLE_TIMEOUT_MS,
    });
    const idleCallback = (request.mock.calls[0] as unknown as [() => void])[0];
    idleCallback();
    expect(onReady).toHaveBeenCalledTimes(1);
  });

  it("does nothing after it is cancelled", () => {
    const onReady = vi.fn();
    const cancel = scheduleDeferredMount(onReady);
    cancel();
    vi.advanceTimersByTime(DEFERRED_MOUNT_DELAY_MS * 2);
    expect(onReady).not.toHaveBeenCalled();
  });
});

describe("useDeferredMount", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setReadyState("complete");
    vi.stubGlobal("requestIdleCallback", undefined);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("is false first and true after the delay", () => {
    const seen: boolean[] = [];
    function Probe() {
      seen.push(useDeferredMount());
      return null;
    }
    render(<Probe />);
    expect(seen.at(-1)).toBe(false);
    act(() => {
      vi.advanceTimersByTime(DEFERRED_MOUNT_DELAY_MS);
    });
    expect(seen.at(-1)).toBe(true);
  });
});

describe("scenesSuppressed", () => {
  afterEach(() => {
    document.documentElement.removeAttribute("data-fx");
  });

  it("is false for a normal visit", () => {
    expect(scenesSuppressed()).toBe(false);
  });

  it("is true when the head script switched effects off (Lighthouse, webdriver, ?nosplash)", () => {
    document.documentElement.setAttribute("data-fx", "off");
    expect(scenesSuppressed()).toBe(true);
  });

  it("lets ?webgl bring the scenes back for the browser tests that check them", () => {
    document.documentElement.setAttribute("data-fx", "off");
    expect(scenesSuppressed("?nosplash&webgl")).toBe(false);
    expect(scenesSuppressed("?webgl")).toBe(false);
    expect(scenesSuppressed("?nosplash&nowebgl")).toBe(true);
  });

  it("keeps useDeferredMount false while suppressed", () => {
    vi.useFakeTimers();
    setReadyState("complete");
    document.documentElement.setAttribute("data-fx", "off");
    const seen: boolean[] = [];
    function Probe() {
      seen.push(useDeferredMount());
      return null;
    }
    render(<Probe />);
    act(() => {
      vi.advanceTimersByTime(DEFERRED_MOUNT_DELAY_MS * 3);
    });
    expect(seen.at(-1)).toBe(false);
    vi.useRealTimers();
  });
});

describe("lowPowerDevice", () => {
  const stub = (values: Record<string, unknown>) => {
    for (const [name, value] of Object.entries(values)) {
      Object.defineProperty(window.navigator, name, { configurable: true, value });
    }
  };
  afterEach(() => {
    for (const name of ["deviceMemory", "hardwareConcurrency", "connection"]) {
      Reflect.deleteProperty(window.navigator, name);
    }
  });

  it("is false when nothing says the device is weak", () => {
    stub({ hardwareConcurrency: 8 });
    expect(lowPowerDevice()).toBe(false);
    stub({ deviceMemory: 8, hardwareConcurrency: 8, connection: { saveData: false } });
    expect(lowPowerDevice()).toBe(false);
  });

  it("is true with Data Saver on, 2 GB of memory or less, or 2 cores or less", () => {
    stub({ connection: { saveData: true } });
    expect(lowPowerDevice()).toBe(true);
    Reflect.deleteProperty(window.navigator, "connection");
    stub({ deviceMemory: 2 });
    expect(lowPowerDevice()).toBe(true);
    Reflect.deleteProperty(window.navigator, "deviceMemory");
    stub({ hardwareConcurrency: 2 });
    expect(lowPowerDevice()).toBe(true);
  });

  it("keeps the static poster for those devices, unless ?webgl asks for the scenes", () => {
    stub({ deviceMemory: 1 });
    expect(scenesSuppressed("")).toBe(true);
    expect(scenesSuppressed("?webgl")).toBe(false);
  });
});
