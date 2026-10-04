import { describe, expect, it } from "vitest";
import { guessViewportSize } from "./device";

const headers = (values: Record<string, string>) => ({
  get: (name: string) => values[name.toLowerCase()] ?? null,
});

describe("guessViewportSize", () => {
  it("trusts the Chromium mobile hint", () => {
    expect(guessViewportSize(headers({ "sec-ch-ua-mobile": "?1" }))).toBe("phone");
    expect(guessViewportSize(headers({ "sec-ch-ua-mobile": "?0" }))).toBe("desktop");
  });

  it("falls back to the user agent", () => {
    const iphone =
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148";
    expect(guessViewportSize(headers({ "user-agent": iphone }))).toBe("phone");
    expect(
      guessViewportSize(headers({ "user-agent": "Mozilla/5.0 (Windows NT 10.0) Chrome/120" })),
    ).toBe("desktop");
  });

  it("defaults to desktop when nothing is known", () => {
    expect(guessViewportSize(headers({}))).toBe("desktop");
  });
});
