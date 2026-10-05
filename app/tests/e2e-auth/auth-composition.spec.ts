import { expect, test } from "@playwright/test";

const DESKTOP_SIZES = [
  { width: 1908, height: 835 },
  { width: 2560, height: 1080 },
  { width: 1440, height: 900 },
  { width: 1280, height: 720 },
] as const;
const STACKED_SIZES = [
  { width: 768, height: 1024 },
  { width: 390, height: 844 },
] as const;
const ROUTES = ["/login", "/register"] as const;
const MAX_GAP_RATIO = 0.4;
const CENTER_SHARE = 0.7;
/** Below this width the group naturally spans more than the center 70 percent. */
const WIDE_FROM = 1600;

/** Right edge of the headline block's real content (not its stretched grid cell). */
async function headlineRight(page: import("@playwright/test").Page): Promise<number> {
  return page.evaluate(() => {
    const intro = document.querySelector(".auth-intro");
    if (!intro) return -1;
    let right = 0;
    for (const child of intro.querySelectorAll("h1, p, li")) {
      const range = document.createRange();
      range.selectNodeContents(child);
      for (const rect of range.getClientRects()) right = Math.max(right, rect.right);
    }
    return right;
  });
}

test.describe("auth composition: no dead middle, form near the content", () => {
  for (const route of ROUTES) {
    for (const size of DESKTOP_SIZES) {
      test(`${route} ${size.width}x${size.height} is one centered group`, async ({ page }) => {
        await page.setViewportSize(size);
        await page.goto(`${route}?nosplash`);
        const card = await page.locator(".auth-card").boundingBox();
        const intro = await page.locator(".auth-intro").boundingBox();
        expect(card && intro).toBeTruthy();
        const gap = card!.x - (await headlineRight(page));
        expect(gap, "gap between headline and form card").toBeGreaterThan(0);
        expect(gap / size.width, "gap share of viewport").toBeLessThan(MAX_GAP_RATIO);
        const margin = size.width >= WIDE_FROM ? (size.width * (1 - CENTER_SHARE)) / 2 : 0;
        expect(card!.x, "card inside the center 70 percent").toBeGreaterThanOrEqual(margin);
        expect(card!.x + card!.width).toBeLessThanOrEqual(size.width - margin);
        expect(intro!.x, "headline sits inside the viewport gutters").toBeGreaterThan(
          size.width * 0.1,
        );
      });
    }

    for (const size of STACKED_SIZES) {
      test(`${route} ${size.width}x${size.height} stacks with a centered form`, async ({
        page,
      }) => {
        await page.setViewportSize(size);
        await page.goto(`${route}?nosplash`);
        const card = await page.locator(".auth-card").boundingBox();
        const intro = await page.locator(".auth-intro").boundingBox();
        expect(intro!.y + intro!.height).toBeLessThanOrEqual(card!.y + 1);
        expect(card!.width).toBeLessThanOrEqual(520);
        const centerOffset = Math.abs(card!.x + card!.width / 2 - size.width / 2);
        expect(centerOffset).toBeLessThan(2);
      });
    }
  }
});
