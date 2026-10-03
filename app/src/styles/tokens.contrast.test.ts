import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/** WCAG 2.2 AA check for the token pairs the UI relies on (run in CI via pnpm test). */
const css = readFileSync(join(__dirname, "tokens.css"), "utf8");

function readTheme(selector: string): Record<string, string> {
  const start = css.indexOf(selector);
  const block = css.slice(css.indexOf("{", start) + 1, css.indexOf("}", start));
  const tokens: Record<string, string> = {};
  for (const match of block.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) {
    tokens[match[1] as string] = (match[2] as string).toLowerCase();
  }
  return tokens;
}

function luminance(hex: string): number {
  const channel = (offset: number) => {
    const value = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

const themes = {
  dark: readTheme(':root,\n[data-theme="dark"] {'),
  light: readTheme('[data-theme="light"] {'),
};

const textPairs: Array<[string, string, string, number]> = [
  ["text on bg", "text", "bg", 4.5],
  ["text on surface", "text", "surface", 4.5],
  ["text on raised", "text", "bg-raised", 4.5],
  ["muted on bg", "text-muted", "bg", 4.5],
  ["muted on surface", "text-muted", "surface", 4.5],
  ["brand text on bg", "brand", "bg", 4.5],
  ["on-brand on brand fill", "on-brand", "brand", 4.5],
  ["accent on bg", "accent", "bg", 4.5],
  ["on-accent on accent fill", "on-accent", "accent", 4.5],
  ["info on bg", "info", "bg", 4.5],
  ["danger on bg", "danger", "bg", 4.5],
];

describe.each(Object.entries(themes))("%s theme tokens", (_name, tokens) => {
  it("defines the full token set", () => {
    for (const key of [
      "bg",
      "bg-raised",
      "surface",
      "border",
      "text",
      "text-muted",
      "brand",
      "brand-deep",
      "brand-glow",
      "focus",
      "accent",
      "info",
      "danger",
    ]) {
      expect(tokens[key], key).toBeDefined();
    }
  });

  it.each(textPairs)("%s meets AA", (_label, fg, bg, min) => {
    expect(contrast(tokens[fg] as string, tokens[bg] as string)).toBeGreaterThanOrEqual(min);
  });

  it("keeps the focus indicator visible (3:1 against bg and surface)", () => {
    expect(contrast(tokens.focus as string, tokens.bg as string)).toBeGreaterThanOrEqual(3);
    expect(contrast(tokens.focus as string, tokens.surface as string)).toBeGreaterThanOrEqual(3);
  });
});

describe("plan token values", () => {
  it("matches the approved palette", () => {
    expect(themes.dark.bg).toBe("#06120b");
    expect(themes.dark.brand).toBe("#40c057");
    expect(themes.light.bg).toBe("#f5faf4");
    expect(themes.light.brand).toBe("#23813a");
  });
});
