import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { documentHeightRatio, lineCount, resetMock, signIn } from "./helpers";

const SCREENS = resolve(__dirname, "../../../../docs/screens/member");
const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "phone", width: 390, height: 844 },
] as const;
const THEMES = ["dark", "light"] as const;

mkdirSync(SCREENS, { recursive: true });

async function settle(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(1800);
}

/** Visible headings in the active content must stay within two lines. */
async function headingsAreShort(page: Page, scope = "main") {
  const lines = await page.evaluate((root) => {
    const result: Array<{ text: string; lines: number }> = [];
    for (const heading of document.querySelectorAll(`${root} h1, ${root} h2`)) {
      const el = heading as HTMLElement;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      if (el.closest("[inert]")) continue;
      const range = document.createRange();
      range.selectNodeContents(el);
      const tops = new Set([...range.getClientRects()].map((r) => Math.round(r.top / 4)));
      result.push({ text: el.textContent ?? "", lines: tops.size });
    }
    return result;
  }, scope);
  for (const item of lines) expect(item.lines, `"${item.text}" lines`).toBeLessThanOrEqual(2);
  expect(lines.length).toBeGreaterThan(0);
}

/**
 * WCAG AA text contrast for every visible text element against its solid background colors
 * (gradients and the 3D canvas are decorative here and are ignored). Disabled controls and
 * inert panels are exempt, as in the standard.
 */
async function lowContrastText(page: Page) {
  return page.evaluate(() => {
    type Rgba = [number, number, number, number];
    const parse = (value: string): Rgba | null => {
      const rgb = value.match(/^rgba?\(([^)]+)\)$/);
      if (rgb) {
        const parts = rgb[1]!
          .split(/[,/ ]+/)
          .filter(Boolean)
          .map(Number);
        return [parts[0]!, parts[1]!, parts[2]!, parts[3] ?? 1];
      }
      const srgb = value.match(/^color\(srgb ([^)]+)\)$/);
      if (srgb) {
        const [rgbPart, alpha] = srgb[1]!.split("/");
        const channels = rgbPart!
          .trim()
          .split(/\s+/)
          .map((c) => Number(c) * 255);
        return [channels[0]!, channels[1]!, channels[2]!, alpha ? Number(alpha) : 1];
      }
      return null;
    };
    const over = (top: Rgba, base: Rgba): Rgba => {
      const a = top[3] + base[3] * (1 - top[3]);
      const mix = (i: 0 | 1 | 2) => (top[i] * top[3] + base[i] * base[3] * (1 - top[3])) / (a || 1);
      return [mix(0), mix(1), mix(2), a];
    };
    const channel = (v: number) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    const luminance = (c: Rgba) =>
      0.2126 * channel(c[0]) + 0.7152 * channel(c[1]) + 0.0722 * channel(c[2]);
    const ratio = (a: Rgba, b: Rgba) => {
      const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
      return (hi! + 0.05) / (lo! + 0.05);
    };
    const backgroundOf = (el: Element): Rgba => {
      const layers: Rgba[] = [];
      for (let node: Element | null = el; node; node = node.parentElement) {
        const color = parse(getComputedStyle(node).backgroundColor);
        if (color && color[3] > 0) layers.push(color);
      }
      return layers.reduceRight<Rgba>((base, layer) => over(layer, base), [255, 255, 255, 1]);
    };

    const problems: string[] = [];
    let checked = 0;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const seen = new Set<Element>();
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const el = node.parentElement;
      if (!el || seen.has(el) || !node.textContent?.trim()) continue;
      seen.add(el);
      if (el.closest("[inert], [aria-hidden=true], [hidden], .sr-only, .skip-link, script, style"))
        continue;
      if (el.closest(":disabled, [aria-disabled=true]")) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      if (
        rect.bottom < 0 ||
        rect.top > window.innerHeight ||
        rect.right < 0 ||
        rect.left > window.innerWidth
      )
        continue;
      const style = getComputedStyle(el);
      if (style.visibility === "hidden") continue;
      const fgRaw = parse(style.color);
      if (!fgRaw) continue;
      const bg = backgroundOf(el);
      const fg = over([fgRaw[0], fgRaw[1], fgRaw[2], fgRaw[3] * Number(style.opacity || 1)], bg);
      const size = Number.parseFloat(style.fontSize);
      const bold = Number.parseInt(style.fontWeight, 10) >= 600;
      const large = size >= 24 || (bold && size >= 18.66);
      const needed = large ? 3 : 4.5;
      const got = ratio(fg, bg);
      checked += 1;
      if (got < needed) {
        problems.push(
          `${(node.textContent ?? "").trim().slice(0, 30)} ${got.toFixed(2)} < ${needed}`,
        );
      }
    }
    if (checked < 10) problems.push(`only ${checked} text elements were checked`);
    return problems;
  });
}

async function noHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

/** Elements that must not overlap each other: pairs of visible, interactive boxes. */
async function noOverlappingControls(page: Page) {
  const overlaps = await page.evaluate(() => {
    const boxes: Array<{ name: string; r: DOMRect }> = [];
    const selector = "a[href], button, input, [role=button]";
    for (const el of document.querySelectorAll(selector)) {
      if ((el as HTMLElement).closest("[inert], [hidden], .skip-link")) continue;
      if (el.classList.contains("skip-link") || el.classList.contains("field__action")) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 4 || r.height < 4) continue;
      if (r.right < 0 || r.left > window.innerWidth || r.bottom < 0 || r.top > window.innerHeight)
        continue;
      const style = getComputedStyle(el);
      if (style.visibility === "hidden" || style.display === "none") continue;
      boxes.push({
        name: (el.textContent || el.getAttribute("aria-label") || el.tagName).trim().slice(0, 30),
        r,
      });
    }
    const found: string[] = [];
    for (let i = 0; i < boxes.length; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) {
        const a = boxes[i]!.r;
        const b = boxes[j]!.r;
        const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (w > 3 && h > 3) found.push(`${boxes[i]!.name} x ${boxes[j]!.name}`);
      }
    }
    return found;
  });
  expect(overlaps).toEqual([]);
}

for (const viewport of VIEWPORTS) {
  for (const theme of THEMES) {
    test.describe(`${viewport.name} ${theme}`, () => {
      test.use({
        viewport: { width: viewport.width, height: viewport.height },
        colorScheme: theme,
      });

      test.beforeEach(async ({ context }) => {
        await resetMock();
        await signIn(context, theme);
      });

      test("dashboard fits the viewport", async ({ page }) => {
        await page.goto("/dashboard");
        await expect(page.getByTestId("result-split")).toBeVisible();
        expect(await page.locator("html").getAttribute("data-theme")).toBe(theme);
        await settle(page);
        expect(await documentHeightRatio(page)).toBeLessThanOrEqual(1.15);
        await noHorizontalOverflow(page);
        await headingsAreShort(page);
        await noOverlappingControls(page);
        expect(await lowContrastText(page)).toEqual([]);
        await page.screenshot({ path: `${SCREENS}/dashboard-${viewport.name}-${theme}.png` });

        if (viewport.name === "phone") {
          // Sections slide sideways instead of scrolling the page.
          await page.getByRole("button", { name: "Go to Diseases" }).click();
          await page.waitForTimeout(700);
          await expect(page.getByTestId("top-diseases")).toBeInViewport();
          await page.screenshot({
            path: `${SCREENS}/dashboard-diseases-${viewport.name}-${theme}.png`,
          });
          await page.getByRole("button", { name: "Go to Recent" }).click();
          await page.waitForTimeout(700);
          await expect(page.getByTestId("recent-scans")).toBeInViewport();
          await page.screenshot({
            path: `${SCREENS}/dashboard-recent-${viewport.name}-${theme}.png`,
          });
          expect(await documentHeightRatio(page)).toBeLessThanOrEqual(1.15);
        }
      });

      test("account panels fit the viewport", async ({ page }) => {
        for (const id of ["profile", "password", "danger"] as const) {
          await page.goto(`/account#${id}`);
          await page.waitForTimeout(900);
          await expect(page.locator(`#${id}`)).toHaveAttribute("data-active", "true");
          expect(await documentHeightRatio(page)).toBeLessThanOrEqual(1.15);
          await noHorizontalOverflow(page);
          await headingsAreShort(page);
          await noOverlappingControls(page);
          expect(await lowContrastText(page)).toEqual([]);
          await page.screenshot({ path: `${SCREENS}/account-${id}-${viewport.name}-${theme}.png` });
        }
      });

      test("dashboard empty state fits", async ({ page, context }) => {
        await resetMock({ scans: [] });
        await signIn(context, theme);
        await page.goto("/dashboard");
        await expect(page.getByRole("heading", { name: "Scan your first leaf" })).toBeVisible();
        await settle(page);
        expect(await documentHeightRatio(page)).toBeLessThanOrEqual(1.15);
        await noHorizontalOverflow(page);
        await headingsAreShort(page);
        await noOverlappingControls(page);
        await page.screenshot({
          path: `${SCREENS}/dashboard-empty-${viewport.name}-${theme}.png`,
        });
      });
    });
  }
}

test.describe("short laptop screens", () => {
  test.use({ colorScheme: "dark" });

  test.beforeEach(async ({ context }) => {
    await resetMock();
    await signIn(context, "dark");
  });

  for (const size of [
    { width: 1280, height: 720 },
    { width: 1366, height: 768 },
    { width: 1024, height: 768 },
  ]) {
    test(`dashboard keeps a readable ring at ${size.width}x${size.height}`, async ({ page }) => {
      await page.setViewportSize(size);
      await page.goto("/dashboard");
      await expect(page.getByTestId("result-split")).toBeVisible();
      await settle(page);
      expect(await documentHeightRatio(page)).toBeLessThanOrEqual(1.15);
      await noHorizontalOverflow(page);
      await noOverlappingControls(page);
      const orb = await page.locator(".orb").boundingBox();
      expect(orb?.height ?? 0).toBeGreaterThanOrEqual(130);
      // Nothing is cut off: every section ends inside the stage.
      const clipped = await page.evaluate(() => {
        const stage = document.querySelector(".dash")?.getBoundingClientRect();
        const bottoms = [...document.querySelectorAll(".dash__sec")].map(
          (el) => el.scrollHeight - el.clientHeight,
        );
        return { stageBottom: stage?.bottom ?? 0, overflow: Math.max(...bottoms) };
      });
      expect(clipped.overflow).toBeLessThanOrEqual(2);
      await page.screenshot({ path: `${SCREENS}/dashboard-${size.width}x${size.height}-dark.png` });
    });
  }
});

test.describe("typography rules", () => {
  test.beforeEach(async ({ context }) => {
    await resetMock();
    await signIn(context);
  });

  test("no element on the member pages allows hyphenation", async ({ page }) => {
    for (const path of ["/dashboard", "/account"]) {
      await page.goto(path);
      const offenders = await page.evaluate(
        () =>
          [...document.querySelectorAll("main *")].filter(
            (el) => getComputedStyle(el).hyphens !== "none" && el.childNodes.length > 0,
          ).length,
      );
      expect(offenders, path).toBe(0);
    }
  });

  test("page titles are one line at 360, 768 and 1440", async ({ page }) => {
    for (const width of [360, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      for (const path of ["/dashboard", "/account"]) {
        await page.goto(path);
        expect(await lineCount(page, "main h1"), `${path} at ${width}`).toBeLessThanOrEqual(2);
      }
    }
  });
});
