// @vitest-environment node
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const publicDir = path.resolve(__dirname, "../../../public");
const manifest = JSON.parse(readFileSync(path.join(publicDir, "manifest.webmanifest"), "utf8")) as {
  id?: string;
  lang?: string;
  name: string;
  display: string;
  start_url: string;
  scope: string;
  theme_color: string;
  background_color: string;
  categories?: string[];
  icons: Array<{ src: string; sizes: string; purpose?: string }>;
  shortcuts: Array<{ name: string; url: string; icons?: Array<{ src: string }> }>;
};

describe("PWA manifest", () => {
  it("is installable: standalone, named, scoped, with a stable id", () => {
    expect(manifest.name).toBe("Leafy");
    expect(manifest.display).toBe("standalone");
    expect(manifest.id).toBe("/");
    expect(manifest.lang).toBe("en");
    expect(manifest.scope).toBe("/");
    expect(manifest.start_url.startsWith("/")).toBe(true);
  });

  it("uses the dark token colors", () => {
    expect(manifest.theme_color).toBe("#06120b");
    expect(manifest.background_color).toBe("#06120b");
  });

  it("ships any and maskable icons at 192 and 512, and every file exists", () => {
    for (const size of ["192x192", "512x512"]) {
      for (const purpose of ["any", "maskable"]) {
        expect(
          manifest.icons.some((icon) => icon.sizes === size && icon.purpose === purpose),
          `${purpose} ${size}`,
        ).toBe(true);
      }
    }
    for (const icon of manifest.icons) {
      expect(existsSync(path.join(publicDir, icon.src)), icon.src).toBe(true);
    }
  });

  it("has Scan a leaf and Handbook shortcuts with existing icons", () => {
    expect(manifest.shortcuts.map((shortcut) => shortcut.url)).toEqual(["/scan", "/handbook"]);
    for (const shortcut of manifest.shortcuts) {
      for (const icon of shortcut.icons ?? []) {
        expect(existsSync(path.join(publicDir, icon.src))).toBe(true);
      }
    }
  });

  it("declares categories for store style listings", () => {
    expect(manifest.categories).toEqual(expect.arrayContaining(["education"]));
  });
});

describe("share and icon assets referenced by metadata", () => {
  it.each([
    "og/og-image.png",
    "icons/favicon.svg",
    "icons/favicon-32.png",
    "icons/apple-touch-icon.png",
    "favicon.ico",
  ])("%s exists", (file) => {
    expect(existsSync(path.join(publicDir, file))).toBe(true);
  });
});
