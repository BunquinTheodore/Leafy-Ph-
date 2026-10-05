import type { Browser, BrowserContext, Page } from "@playwright/test";
import { expect, newMember, test } from "./support";

/**
 * Layout rules across the main routes at phone, tablet and desktop widths, against the real
 * stack: headings of at most two lines, no long document scrolling, no sideways page overflow
 * and no hyphenation. Sideways SlidePanels replace vertical scrolling; the legal pages are the
 * one exemption from the height rule.
 */
const VIEWPORTS = [
  { name: "phone", width: 360, height: 740 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1440, height: 900 },
] as const;
const MAX_HEIGHT_RATIO = 1.15;
const MAX_HEADING_LINES = 2;
const LEGAL_PATHS = new Set(["/privacy", "/terms"]);

const PUBLIC_PATHS = [
  "/",
  "/handbook",
  "/handbook/tomato",
  "/about",
  "/privacy",
  "/terms",
  "/login",
  "/register",
];
const MEMBER_PATHS = ["/dashboard", "/scan", "/scans", "/account"];

interface Measure {
  headings: Array<{ text: string; lines: number }>;
  docHeight: number;
  scrollWidth: number;
  clientWidth: number;
  hyphenated: string[];
}

async function measure(page: Page): Promise<Measure> {
  return page.evaluate(() => {
    const linesOf = (element: Element): number => {
      const range = document.createRange();
      range.selectNodeContents(element);
      const tops = new Set(
        Array.from(range.getClientRects())
          .filter((rect) => rect.width > 1 && rect.height > 1)
          .map((rect) => Math.round(rect.top / 4)),
      );
      return Math.max(tops.size, 1);
    };
    const headings = Array.from(document.querySelectorAll("h1, h2"))
      .filter((element) => {
        const style = getComputedStyle(element);
        const box = element.getBoundingClientRect();
        return style.visibility !== "hidden" && style.display !== "none" && box.width > 0;
      })
      .map((element) => ({
        text: (element.textContent ?? "").trim().slice(0, 60),
        lines: linesOf(element),
      }));
    const hyphenated = Array.from(document.body.querySelectorAll("*"))
      .filter((element) => {
        const value = getComputedStyle(element).hyphens;
        return value === "auto";
      })
      .map((element) => element.tagName.toLowerCase());
    if ((document.body.textContent ?? "").includes("­")) hyphenated.push("soft-hyphen");
    return {
      headings,
      docHeight: document.documentElement.scrollHeight,
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      hyphenated,
    };
  });
}

async function check(page: Page, path: string, viewport: { width: number; height: number }) {
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  const response = await page.goto(`${path}${path.includes("?") ? "&" : "?"}nosplash`);
  expect(response?.status(), `${path} status`).toBeLessThan(400);
  await page.waitForLoadState("networkidle").catch(() => undefined);
  const result = await measure(page);

  for (const heading of result.headings) {
    expect(
      heading.lines,
      `"${heading.text}" on ${path} at ${viewport.width}px has ${heading.lines} lines`,
    ).toBeLessThanOrEqual(MAX_HEADING_LINES);
  }
  expect(
    result.scrollWidth,
    `${path} overflows sideways at ${viewport.width}px`,
  ).toBeLessThanOrEqual(result.clientWidth + 1);
  expect(result.hyphenated, `${path} hyphenates text`).toEqual([]);
  if (!LEGAL_PATHS.has(path)) {
    expect(
      result.docHeight,
      `${path} is ${result.docHeight}px tall at ${viewport.width}x${viewport.height}`,
    ).toBeLessThanOrEqual(viewport.height * MAX_HEIGHT_RATIO);
  }
}

async function diseasePath(browser: Browser, baseURL: string): Promise<string> {
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();
  await page.goto("/handbook/tomato?nosplash");
  const href = await page.locator('a[href^="/handbook/tomato/"]').first().getAttribute("href");
  await context.close();
  if (!href) throw new Error("No tomato disease link in the handbook");
  return href;
}

for (const viewport of VIEWPORTS) {
  test.describe(`layout at ${viewport.width}px`, () => {
    let diseaseUrl = "";
    test.beforeAll(async ({ browser }, info) => {
      diseaseUrl = await diseasePath(browser, String(info.project.use.baseURL));
    });

    for (const path of PUBLIC_PATHS) {
      test(`public ${path}`, async ({ page }) => {
        await check(page, path, viewport);
      });
    }

    test("public disease page", async ({ page }) => {
      await check(page, diseaseUrl, viewport);
    });

    test.describe("signed in", () => {
      let context: BrowserContext;
      let memberPage: Page;
      test.beforeAll(async ({ browser }, info) => {
        const member = await newMember(browser, String(info.project.use.baseURL), "layout");
        memberPage = member.page;
        context = memberPage.context();
      });
      test.afterAll(async () => {
        await context.close();
      });

      for (const path of MEMBER_PATHS) {
        test(`member ${path}`, async () => {
          await check(memberPage, path, viewport);
        });
      }
    });
  });
}

test.describe("splash", () => {
  test.beforeEach(async ({ page }) => {
    // Playwright sets navigator.webdriver, which switches the splash off. Real visitors have it.
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => false });
    });
  });

  test("shows on a hard load and not on client navigation", async ({ page }) => {
    await page.goto("/", { waitUntil: "commit" });
    const splash = page.locator("#leafy-splash");
    await expect(splash).toHaveAttribute("data-state", "active", { timeout: 2_000 });
    await expect(splash).toHaveAttribute("data-state", "done", { timeout: 10_000 });

    // Watch the splash state and keep a marker so a full reload would be noticed.
    await page.evaluate(() => {
      const target = document.getElementById("leafy-splash");
      const seen: string[] = [];
      (window as unknown as { __splashSeen: string[] }).__splashSeen = seen;
      (window as unknown as { __marker: number }).__marker = 1;
      new MutationObserver(() => seen.push(target?.getAttribute("data-state") ?? "gone")).observe(
        target as Element,
        { attributes: true, attributeFilter: ["data-state"] },
      );
    });
    await page.getByRole("navigation").getByRole("link", { name: "Handbook" }).first().click();
    await page.waitForURL("**/handbook");
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();

    const after = await page.evaluate(() => ({
      marker: (window as unknown as { __marker?: number }).__marker,
      seen: (window as unknown as { __splashSeen: string[] }).__splashSeen,
      state: document.getElementById("leafy-splash")?.getAttribute("data-state"),
    }));
    expect(after.marker, "navigation reloaded the page").toBe(1);
    expect(after.seen).not.toContain("active");
    expect(after.state).toBe("done");

    // A hard load of another page shows it again.
    await page.goto("/about", { waitUntil: "commit" });
    await expect(page.locator("#leafy-splash")).toHaveAttribute("data-state", "active", {
      timeout: 2_000,
    });
  });
});
