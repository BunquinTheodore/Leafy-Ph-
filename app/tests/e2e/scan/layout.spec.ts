import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { choosePhoto, documentHeightRatio, lineCount, resetMock, signIn } from "./helpers";

const SCREENS = resolve(__dirname, "../../../../docs/screens/scan");
const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "phone", width: 390, height: 844 },
] as const;
const THEMES = ["dark", "light"] as const;
const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

mkdirSync(SCREENS, { recursive: true });

async function settle(page: Page, ms = 1500) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(ms);
}

/** Visible headings in the active content must stay within two lines. */
async function headingsAreShort(page: Page) {
  const lines = await page.evaluate(() => {
    const result: Array<{ text: string; lines: number }> = [];
    for (const heading of document.querySelectorAll("main h1, main h2")) {
      const el = heading as HTMLElement;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      if (el.closest("[inert], dialog:not([open])")) continue;
      const range = document.createRange();
      range.selectNodeContents(el);
      const tops = new Set([...range.getClientRects()].map((r) => Math.round(r.top / 4)));
      result.push({ text: el.textContent ?? "", lines: tops.size });
    }
    return result;
  });
  for (const item of lines) expect(item.lines, `"${item.text}" lines`).toBeLessThanOrEqual(2);
  expect(lines.length).toBeGreaterThan(0);
}

async function noHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

async function noHyphenation(page: Page) {
  const offenders = await page.evaluate(
    () =>
      [...document.querySelectorAll("main *")].filter(
        (el) => getComputedStyle(el).hyphens !== "none" && el.childNodes.length > 0,
      ).length,
  );
  expect(offenders).toBe(0);
}

/** Visible, interactive boxes must not sit on top of each other. */
async function noOverlappingControls(page: Page) {
  const overlaps = await page.evaluate(() => {
    /** The part of an element a person can actually see: clipped by every scrolling ancestor. */
    const visibleRect = (el: Element) => {
      const r = el.getBoundingClientRect();
      let left = Math.max(r.left, 0);
      let top = Math.max(r.top, 0);
      let right = Math.min(r.right, window.innerWidth);
      let bottom = Math.min(r.bottom, window.innerHeight);
      for (let parent = el.parentElement; parent; parent = parent.parentElement) {
        const style = getComputedStyle(parent);
        if (style.overflowX === "visible" && style.overflowY === "visible") continue;
        const p = parent.getBoundingClientRect();
        left = Math.max(left, p.left);
        top = Math.max(top, p.top);
        right = Math.min(right, p.right);
        bottom = Math.min(bottom, p.bottom);
      }
      return { left, top, right, bottom, width: right - left, height: bottom - top };
    };
    const boxes: Array<{ name: string; r: ReturnType<typeof visibleRect> }> = [];
    for (const el of document.querySelectorAll(
      "a[href], button, input, select, textarea, [role=button]",
    )) {
      if ((el as HTMLElement).closest("[inert], [hidden], .sr-only")) continue;
      // The skip link sits under the logo until it gets focus; that is by design.
      if (el.classList.contains("sr-only") || el.classList.contains("skip-link")) continue;
      const style = getComputedStyle(el);
      if (style.visibility === "hidden" || style.display === "none") continue;
      const r = visibleRect(el);
      if (r.width < 4 || r.height < 4) continue;
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

async function checkPage(page: Page) {
  expect(await documentHeightRatio(page)).toBeLessThanOrEqual(1.15);
  await noHorizontalOverflow(page);
  await headingsAreShort(page);
  await noHyphenation(page);
  await noOverlappingControls(page);
}

for (const viewport of VIEWPORTS) {
  for (const theme of THEMES) {
    const tag = `${viewport.name}-${theme}`;
    test.describe(`${viewport.name} ${theme}`, () => {
      test.use({
        viewport: { width: viewport.width, height: viewport.height },
        colorScheme: theme,
      });

      test.beforeEach(async ({ context }) => {
        await resetMock({
          seed: 18,
          seedKinds: ["disease", "healthy", "unknown", "fail_ml", "disease", "healthy"],
          timing: { validatingMs: 600, analyzingMs: 30_000, savingMs: 600 },
        });
        await signIn(context, theme);
      });

      test("scan page: dropzone, preview and progress fit the viewport", async ({ page }) => {
        await page.goto("/scan");
        await expect(page.getByTestId("upload-photo")).toBeVisible();
        expect(await page.locator("html").getAttribute("data-theme")).toBe(theme);
        await settle(page);
        await checkPage(page);
        await page.screenshot({ path: `${SCREENS}/scan-idle-${tag}.png` });

        await choosePhoto(page);
        await expect(page.getByTestId("preview-image")).toBeVisible();
        await settle(page, 600);
        await checkPage(page);
        await page.screenshot({ path: `${SCREENS}/scan-preview-${tag}.png` });

        await page.getByRole("button", { name: "Analyze leaf" }).click();
        await expect(page.getByTestId("progress-panel")).toHaveAttribute("data-step", "analyzing", {
          timeout: 15_000,
        });
        await settle(page, 2500);
        await checkPage(page);
        await page.screenshot({ path: `${SCREENS}/scan-progress-${tag}.png` });
      });

      test("result panels fit the viewport", async ({ page }) => {
        for (const id of ["result", "causes", "symptoms", "treatment", "photos"] as const) {
          await page.goto(`/scans/${ID(1)}#${id}`);
          await expect(page.getByTestId("result-view")).toBeVisible();
          await page.waitForTimeout(1200);
          await expect(page.locator(`#${id}`)).toHaveAttribute("data-active", "true");
          await checkPage(page);
          await page.screenshot({ path: `${SCREENS}/result-${id}-${tag}.png` });
        }
      });

      test("healthy, unclear and failed outcomes fit the viewport", async ({ page }) => {
        const cases = [
          { name: "healthy", id: ID(2), hash: "#care" },
          { name: "unknown", id: ID(3), hash: "#retake" },
        ];
        for (const item of cases) {
          await page.goto(`/scans/${item.id}${item.hash}`);
          await expect(page.getByTestId("result-view")).toBeVisible();
          await page.waitForTimeout(1000);
          await checkPage(page);
          await page.screenshot({ path: `${SCREENS}/outcome-${item.name}-${tag}.png` });
        }
        await page.goto(`/scans/${ID(4)}`);
        await expect(page.getByTestId("failed-view")).toBeVisible();
        await settle(page, 800);
        await checkPage(page);
        await page.screenshot({ path: `${SCREENS}/outcome-failed-${tag}.png` });
      });

      test("history rail, grid and empty state fit the viewport", async ({ page }) => {
        await page.goto("/scans");
        await expect(page.getByTestId("history-card").first()).toBeVisible();
        await settle(page, 1000);
        await checkPage(page);
        await page.screenshot({ path: `${SCREENS}/history-rail-${tag}.png` });

        await page.getByRole("button", { name: "Grid", exact: true }).click();
        await page.waitForTimeout(500);
        await page.screenshot({ path: `${SCREENS}/history-grid-${tag}.png` });
        await checkPage(page);

        await resetMock({ seed: 0 });
        await page.goto("/scans");
        await expect(page.getByRole("heading", { name: "No scans yet" })).toBeVisible();
        await checkPage(page);
        await page.screenshot({ path: `${SCREENS}/history-empty-${tag}.png` });
      });

      test("error states fit the viewport", async ({ page }) => {
        await resetMock({
          createError: { status: 429, code: "rate_limited", message: "Too many.", retryAfter: 90 },
        });
        await page.goto("/scan");
        await choosePhoto(page);
        await page.getByRole("button", { name: "Analyze leaf" }).click();
        await expect(page.getByTestId("rate-limit-prompt")).toBeVisible();
        await checkPage(page);
        await page.screenshot({ path: `${SCREENS}/error-rate-limit-${tag}.png` });

        await resetMock({ user: { email_verified: false, email_verified_at: null } });
        await page.goto("/scan");
        await expect(page.getByTestId("unverified-prompt")).toBeVisible();
        await checkPage(page);
        await page.screenshot({ path: `${SCREENS}/error-unverified-${tag}.png` });
      });
    });
  }
}

test.describe("typography and keyboard", () => {
  test.beforeEach(async ({ context }) => {
    await resetMock({ seed: 6 });
    await signIn(context);
  });

  test("page titles stay within two lines at 360, 768 and 1440", async ({ page }) => {
    for (const width of [360, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      for (const path of ["/scan", "/scans", `/scans/${ID(1)}`, `/scans/${ID(3)}`]) {
        await page.goto(path);
        await expect(page.locator("main h1").first()).toBeVisible();
        expect(await lineCount(page, "main h1"), `${path} at ${width}`).toBeLessThanOrEqual(2);
      }
    }
  });

  test("the scan page works with the keyboard alone", async ({ page }) => {
    await page.goto("/scan");
    const upload = page.getByTestId("upload-photo");
    await expect(upload).toBeVisible();
    for (let i = 0; i < 20; i += 1) {
      await page.keyboard.press("Tab");
      if (await upload.evaluate((el) => el === document.activeElement)) break;
    }
    await expect(upload).toBeFocused();
    const outline = await upload.evaluate((el) => {
      const style = getComputedStyle(el);
      return `${style.outlineStyle}|${style.outlineWidth}|${style.boxShadow}`;
    });
    expect(outline).not.toBe("none|0px|none");
  });

  test("result panels move with the arrow keys and stay in the document", async ({ page }) => {
    await page.goto(`/scans/${ID(1)}`);
    await expect(page.getByTestId("result-view")).toBeVisible();
    await page.locator("#result").getByTestId("feedback-yes").focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.locator("#causes")).toHaveAttribute("data-active", "true");
    // The panel that held focus is inert now, so keyboard users continue from the panel dots.
    await page.locator(".panels__dot[aria-current=true]").focus();
    await page.keyboard.press("End");
    await expect(page.locator("#photos")).toHaveAttribute("data-active", "true");
    await page.keyboard.press("Home");
    await expect(page.locator("#result")).toHaveAttribute("data-active", "true");
  });

  test("hover states do not change layout or titles", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/scans");
    const card = page.getByTestId("history-card").first();
    await expect(card).toBeVisible();
    const title = page.locator("main h1");
    const before = { box: await title.boundingBox(), lines: await lineCount(page, "main h1") };
    await card.hover();
    const after = { box: await title.boundingBox(), lines: await lineCount(page, "main h1") };
    expect(after).toEqual(before);
  });
});
