import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HEAD_SCRIPT } from "./head-script";

function run(prefersLight: boolean): string | null {
  window.matchMedia = ((query: string) => ({
    matches: prefersLight && query.includes("light"),
  })) as unknown as typeof window.matchMedia;
  document.documentElement.removeAttribute("data-theme");
  new Function(HEAD_SCRIPT)();
  return document.documentElement.getAttribute("data-theme");
}

function clearCookie(): void {
  document.cookie = "leafy_theme=; Path=/; Max-Age=0";
}

beforeEach(() => {
  window.localStorage.clear();
  clearCookie();
});
afterEach(() => {
  window.localStorage.clear();
  clearCookie();
});

describe("head script theme", () => {
  it("falls back to the system preference", () => {
    expect(run(true)).toBe("light");
    expect(run(false)).toBe("dark");
  });

  it("uses localStorage over the system preference", () => {
    window.localStorage.setItem("leafy-theme", "dark");
    expect(run(true)).toBe("dark");
  });

  it("uses the leafy_theme cookie over localStorage and the system preference", () => {
    document.cookie = "leafy_theme=light; Path=/";
    window.localStorage.setItem("leafy-theme", "dark");
    expect(run(false)).toBe("light");
  });

  it("ignores an invalid cookie and reads the cookie among others", () => {
    document.cookie = "leafy_theme=purple; Path=/";
    window.localStorage.setItem("leafy-theme", "light");
    expect(run(false)).toBe("light");
    const spy = vi.spyOn(document, "cookie", "get").mockReturnValue("a=1; leafy_theme=dark; b=2");
    try {
      expect(run(true)).toBe("dark");
    } finally {
      spy.mockRestore();
    }
  });
});

describe("head script effects switch", () => {
  const original = Object.getOwnPropertyDescriptor(window.navigator, "userAgent");
  const setUserAgent = (value: string) =>
    Object.defineProperty(window.navigator, "userAgent", { configurable: true, value });

  afterEach(() => {
    document.documentElement.removeAttribute("data-splash");
    document.documentElement.removeAttribute("data-fx");
    if (original) Object.defineProperty(window.navigator, "userAgent", original);
  });

  it("leaves the splash and effects on for a normal visit", () => {
    run(false);
    expect(document.documentElement.getAttribute("data-fx")).toBeNull();
    expect(document.documentElement.getAttribute("data-splash")).toBeNull();
  });

  it("turns them off for Lighthouse and PageSpeed Insights, which mark their user agent", () => {
    setUserAgent(
      "Mozilla/5.0 (Linux; Android 11; moto g power (2022)) Chrome/126 Mobile Safari/537.36 Chrome-Lighthouse",
    );
    run(false);
    expect(document.documentElement.getAttribute("data-fx")).toBe("off");
    expect(document.documentElement.getAttribute("data-splash")).toBe("off");
  });
});
