import { expect, test, type Page } from "@playwright/test";

const DESKTOP_SIZES = [
  { width: 1908, height: 835 },
  { width: 2560, height: 1080 },
  { width: 1440, height: 900 },
  { width: 1280, height: 720 },
] as const;
const TABLET = { width: 768, height: 1024 } as const;
const PHONE = { width: 390, height: 844 } as const;
const ROUTES = ["/login", "/register"] as const;
const MAX_GAP_RATIO = 0.4;
/** Sub pixel rounding between the header and the page container. */
const EDGE_TOLERANCE = 2;
const PHONE_CARD_MAX = 520;

/** Right edge of the headline block's real content (not its stretched grid cell). */
async function headlineRight(page: Page): Promise<number> {
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

/** The page container as the header draws it: logo left edge to the last nav control's right edge. */
async function headerEdges(page: Page): Promise<{ left: number; right: number }> {
  return page.evaluate(() => {
    const logo = document.querySelector(".site-header a[href='/']");
    const controls = [...document.querySelectorAll(".site-header a, .site-header button")].filter(
      (el) => el.getBoundingClientRect().width > 1,
    );
    return {
      left: logo ? logo.getBoundingClientRect().left : -1,
      right: controls.length ? controls[controls.length - 1]!.getBoundingClientRect().right : -1,
    };
  });
}

test.describe("auth composition: on the page container, no dead middle", () => {
  for (const route of ROUTES) {
    for (const size of DESKTOP_SIZES) {
      test(`${route} ${size.width}x${size.height} fills the header container`, async ({ page }) => {
        await page.setViewportSize(size);
        await page.goto(`${route}?nosplash`);
        const card = await page.locator(".auth-card").boundingBox();
        const intro = await page.locator(".auth-intro").boundingBox();
        const edges = await headerEdges(page);
        expect(card && intro).toBeTruthy();
        expect(
          Math.abs(intro!.x - edges.left),
          "copy starts on the header logo edge",
        ).toBeLessThanOrEqual(EDGE_TOLERANCE);
        expect(
          Math.abs(card!.x + card!.width - edges.right),
          "card ends on the nav edge",
        ).toBeLessThanOrEqual(EDGE_TOLERANCE);
        const gap = card!.x - (await headlineRight(page));
        expect(gap, "gap between headline and form card").toBeGreaterThan(0);
        expect(gap / size.width, "gap share of viewport").toBeLessThan(MAX_GAP_RATIO);
      });
    }

    test(`${route} ${TABLET.width}x${TABLET.height} stacks across the container`, async ({
      page,
    }) => {
      await page.setViewportSize(TABLET);
      await page.goto(`${route}?nosplash`);
      const card = await page.locator(".auth-card").boundingBox();
      const intro = await page.locator(".auth-intro").boundingBox();
      const edges = await headerEdges(page);
      expect(intro!.y + intro!.height).toBeLessThanOrEqual(card!.y + 1);
      expect(Math.abs(intro!.x - edges.left)).toBeLessThanOrEqual(EDGE_TOLERANCE);
      expect(Math.abs(card!.x - edges.left)).toBeLessThanOrEqual(EDGE_TOLERANCE);
      expect(Math.abs(card!.x + card!.width - edges.right)).toBeLessThanOrEqual(EDGE_TOLERANCE);
    });

    test(`${route} ${PHONE.width}x${PHONE.height} stacks with a centered form`, async ({
      page,
    }) => {
      await page.setViewportSize(PHONE);
      await page.goto(`${route}?nosplash`);
      const card = await page.locator(".auth-card").boundingBox();
      const intro = await page.locator(".auth-intro").boundingBox();
      expect(intro!.y + intro!.height).toBeLessThanOrEqual(card!.y + 1);
      expect(card!.width).toBeLessThanOrEqual(PHONE_CARD_MAX);
      const centerOffset = Math.abs(card!.x + card!.width / 2 - PHONE.width / 2);
      expect(centerOffset).toBeLessThan(2);
    });
  }
});
