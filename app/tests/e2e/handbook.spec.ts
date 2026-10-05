import { readFileSync } from "node:fs";
import path from "node:path";
import { devices, expect, test, type Page } from "@playwright/test";
import {
  MAX_DOCUMENT_RATIO,
  VIEWPORTS,
  activePanelOverflow,
  documentRatio,
  focusCarousel,
  goToPanel,
  headingLines,
  horizontalOverflow,
  hyphenationOffenders,
  stablePanelIds,
} from "./helpers";

const activePanelId = (page: Page) =>
  page.evaluate(() => document.querySelector('.panels__panel[data-active="true"]')?.id ?? null);

test.describe("handbook journeys", () => {
  test("browse: plants carousel, plant page, disease page", async ({ page }) => {
    await page.goto("/handbook?nosplash");
    await expect(page.getByRole("heading", { level: 1, name: "Plant handbook" })).toBeVisible();
    await page
      .getByRole("link", { name: /^Tomato/ })
      .first()
      .click();
    await expect(page).toHaveURL(/\/handbook\/tomato$/);
    await expect(page.getByRole("heading", { level: 1, name: "Tomato" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Growth conditions" })).toBeVisible();

    await page
      .getByRole("button", { name: "Go to Diseases 1" })
      .or(page.getByRole("button", { name: "Go to Diseases" }))
      .first()
      .click();
    await expect(page.locator("#diseases")).toHaveAttribute("data-active", "true");
    await page
      .getByRole("link", { name: /Early Blight/ })
      .first()
      .click();
    await expect(page).toHaveURL(/\/handbook\/tomato\/early-blight$/);
    await expect(page.getByRole("heading", { level: 1, name: "Early Blight" })).toBeVisible();
    const crumbs = page.getByRole("navigation", { name: "Breadcrumb" });
    await expect(crumbs.getByRole("link", { name: "Handbook" })).toHaveAttribute(
      "href",
      "/handbook",
    );
    await expect(crumbs.getByRole("link", { name: "Tomato" })).toHaveAttribute(
      "href",
      "/handbook/tomato",
    );
    await expect(crumbs.getByText("Early Blight")).toHaveAttribute("aria-current", "page");
  });

  test("search finds plants and diseases and keeps the query in the URL", async ({ page }) => {
    await page.goto("/handbook?nosplash");
    const box = page.getByRole("searchbox", { name: "Search plants and diseases" });
    await box.fill("potato blight");
    await expect(page.locator("[role=status][aria-live=polite]")).toHaveText(/2 results/);
    await expect(page).toHaveURL(/q=potato(\+|%20)blight/);
    await page.getByRole("link", { name: /Late Blight/ }).click();
    await expect(page).toHaveURL(/\/handbook\/potato\/late-blight$/);
  });

  test("search with no match shows a calm empty state and clears with Escape", async ({ page }) => {
    await page.goto("/handbook?nosplash");
    const box = page.getByRole("searchbox");
    await box.fill("zzzz");
    await expect(page.getByRole("heading", { name: "No matches" })).toBeVisible();
    await box.press("Escape");
    await expect(box).toHaveValue("");
    await expect(page.getByRole("heading", { name: "No matches" })).toBeHidden();
  });

  test("a shared search link restores the results", async ({ page }) => {
    await page.goto("/handbook?nosplash&q=grape");
    await expect(page.getByRole("searchbox")).toHaveValue("grape");
    await expect(page.getByRole("link", { name: /Black Rot/ }).first()).toHaveAttribute(
      "href",
      "/handbook/grape/black-rot",
    );
  });

  test("deep link to a disease panel and hash follows the panels", async ({ page }) => {
    await page.goto("/handbook/tomato/early-blight?nosplash#treatment");
    await expect(page.locator("#treatment")).toHaveAttribute("data-active", "true");
    await expect(page.getByRole("heading", { name: /^Treatment/ })).toBeVisible();
    await stablePanelIds(page);
    await expect(page.locator("#treatment")).toHaveAttribute("data-active", "true");
    await focusCarousel(page);
    // Prevention is left out when it repeats the treatment word for word (samePlan), so the next
    // panel is either prevention or the images.
    await page.keyboard.press("ArrowRight");
    await expect
      .poll(() => page.evaluate(() => window.location.hash))
      .toMatch(/#(prevention|images)/);
    if ((await page.evaluate(() => window.location.hash)) === "#prevention") {
      await page.keyboard.press("ArrowRight");
      await expect.poll(() => page.evaluate(() => window.location.hash)).toBe("#images");
    }
    await expect(page.getByText("Reference photos coming soon")).toBeVisible();
  });

  test("back and forward move through handbook pages and panels", async ({ page }) => {
    await page.goto("/handbook?nosplash");
    await page
      .getByRole("link", { name: /^Potato/ })
      .first()
      .click();
    await expect(page).toHaveURL(/\/handbook\/potato$/);
    await page.goto("/handbook/potato/late-blight?nosplash");
    await expect(page.getByRole("heading", { level: 1, name: "Late Blight" })).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(/\/handbook\/potato(\?.*)?$/);
    await page.goBack();
    await expect(page).toHaveURL(/\/handbook(\?.*)?$/);
    await page.goForward();
    await expect(page).toHaveURL(/\/handbook\/potato(\?.*)?$/);
    // Under load the forward navigation can take a while to render the streamed page.
    await expect(page.getByRole("heading", { level: 1, name: "Potato" })).toBeVisible({
      timeout: 15_000,
    });
  });

  test("hash navigation between panels works with back and forward", async ({ page }) => {
    await page.goto("/handbook/potato/late-blight?nosplash");
    await stablePanelIds(page);
    await goToPanel(page, "causes");
    await goToPanel(page, "symptoms");
    await page.goBack();
    await expect.poll(() => activePanelId(page)).toBe("causes");
    await page.goForward();
    await expect.poll(() => activePanelId(page)).toBe("symptoms");
  });

  test("Blueberry and Soybean say no diseases are catalogued yet", async ({ page }) => {
    for (const slug of ["blueberry", "soybean"]) {
      await page.goto(`/handbook/${slug}?nosplash#diseases`);
      await expect(page.locator("#diseases")).toHaveAttribute("data-active", "true");
      await expect(page.getByRole("heading", { name: "No diseases catalogued yet" })).toBeVisible();
      await expect(page.getByRole("link", { name: "Browse other plants" })).toHaveAttribute(
        "href",
        "/handbook",
      );
    }
  });

  test("the disease footer invites a scan", async ({ page }) => {
    await page.goto("/handbook/apple/apple-scab?nosplash");
    await expect(page.getByText("Think your plant has this?")).toBeVisible();
    await expect(page.locator("#main").getByRole("link", { name: "Scan a leaf" })).toHaveAttribute(
      "href",
      "/scan",
    );
  });

  test("severity is shown with a label and an icon", async ({ page }) => {
    await page.goto("/handbook/tomato/late-blight?nosplash");
    const badge = page.locator(".hb__head .badge");
    await expect(badge).toHaveText(/Severity: (Low|Moderate|High|Severe)/);
    await expect(badge.locator("svg")).toHaveCount(1);
  });

  test("inline terms open a definition on keyboard focus and close with Escape", async ({
    page,
  }) => {
    await page.goto("/handbook/tomato/early-blight?nosplash#treatment");
    await expect(page.locator("#treatment")).toHaveAttribute("data-active", "true");
    await page.waitForLoadState("networkidle");
    const term = page.locator("#treatment .term").first();
    await term.focus();
    await expect(page.getByRole("tooltip")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("tooltip")).toBeHidden();
  });

  test("keyboard: a plant card opens with Enter", async ({ page }) => {
    await page.goto("/handbook?nosplash");
    await page
      .getByRole("link", { name: /^Apple/ })
      .first()
      .focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/handbook\/apple$/);
  });

  test("unknown slugs show the handbook not found page with a 404", async ({ page }) => {
    const response = await page.goto("/handbook/tomato/not-a-disease?nosplash");
    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: "We could not find that page" })).toBeVisible();
    const path = await page.goto("/handbook/..%2Fetc?nosplash");
    expect(path?.status()).toBe(404);
  });

  test("shared canvas: at most one WebGL canvas, none without WebGL", async ({ page }) => {
    await page.goto("/handbook?nosplash&webgl");
    await page.waitForTimeout(6500);
    expect(await page.locator("canvas").count()).toBeLessThanOrEqual(1);
    await page.goto("/handbook?nosplash&nowebgl");
    await page.waitForTimeout(1500);
    await expect(page.locator("canvas")).toHaveCount(0);
    await expect(page.locator(".leaf-accent").first()).toBeVisible();
  });

  test("copy has no hyphenation and no exclamation marks", async ({ page }) => {
    await page.goto("/handbook/tomato/early-blight?nosplash");
    expect(await hyphenationOffenders(page)).toBe(0);
    expect(await page.locator("main").innerText()).not.toContain("!");
  });
});

const DISEASE_PATHS: Array<[string, string]> = [
  ["tomato", "tomato-yellow-leaf-curl-virus"],
  ["orange", "huanglongbing"],
  ["corn", "northern-corn-leaf-blight"],
  ["grape", "esca"],
  ["apple", "apple-scab"],
];

for (const viewport of VIEWPORTS) {
  test.describe(`handbook layout at ${viewport.name}px`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test("handbook index fits one viewport", async ({ page }) => {
      await page.goto("/handbook?nosplash");
      expect(await horizontalOverflow(page)).toBe(0);
      expect(await documentRatio(page)).toBeLessThanOrEqual(MAX_DOCUMENT_RATIO);
      expect(await activePanelOverflow(page)).toBeLessThanOrEqual(1);
      for (const heading of await headingLines(page)) {
        expect(heading.lines, heading.text).toBeLessThanOrEqual(2);
      }
    });

    test("every plant page fits with short titles", async ({ page }) => {
      for (const slug of ["apple", "bell-pepper", "tomato", "blueberry"]) {
        await page.goto(`/handbook/${slug}?nosplash`);
        for (const id of ["overview", "diseases"]) {
          await goToPanel(page, id);
          expect(await documentRatio(page), `${slug} ${id} height`).toBeLessThanOrEqual(
            MAX_DOCUMENT_RATIO,
          );
          expect(await activePanelOverflow(page), `${slug} ${id} overflow`).toBeLessThanOrEqual(1);
          for (const heading of await headingLines(page)) {
            expect(heading.lines, `${slug} ${id}: ${heading.text}`).toBeLessThanOrEqual(2);
          }
        }
      }
    });

    test("disease pages fit panel by panel with titles of two lines at most", async ({ page }) => {
      for (const [plant, disease] of DISEASE_PATHS) {
        await page.goto(`/handbook/${plant}/${disease}?nosplash`);
        expect(await horizontalOverflow(page)).toBe(0);
        const ids = await stablePanelIds(page);
        for (const id of ids) {
          await goToPanel(page, id);
          expect(await documentRatio(page), `${disease} ${id} height`).toBeLessThanOrEqual(
            MAX_DOCUMENT_RATIO,
          );
          expect(await activePanelOverflow(page), `${disease} ${id} overflow`).toBeLessThanOrEqual(
            1,
          );
          for (const heading of await headingLines(page)) {
            expect(heading.lines, `${disease} ${id}: ${heading.text}`).toBeLessThanOrEqual(2);
          }
        }
      }
    });
  });
}

interface SeedDisease {
  plant: string;
  slug: string;
}

const ALL_DISEASES: SeedDisease[] = JSON.parse(
  readFileSync(
    path.resolve(process.cwd(), "..", "api", "app", "seeds", "data", "diseases.json"),
    "utf8",
  ),
);

test.describe("every seeded disease fits its panels", () => {
  for (const viewport of [VIEWPORTS[0], VIEWPORTS[2]]) {
    test(`all ${ALL_DISEASES.length} diseases at ${viewport.name}px`, async ({ page }) => {
      test.setTimeout(420_000);
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      const problems: string[] = [];
      for (const { plant, slug } of ALL_DISEASES) {
        await page.goto(`/handbook/${plant}/${slug}?nosplash`);
        const ids = await stablePanelIds(page);
        if ((await horizontalOverflow(page)) > 0) problems.push(`${slug}: horizontal overflow`);
        for (const id of ids) {
          await goToPanel(page, id);
          const overflow = await activePanelOverflow(page);
          if (overflow > 1)
            problems.push(`${plant}/${slug}#${id}: panel overflows by ${overflow}px`);
          if ((await documentRatio(page)) > MAX_DOCUMENT_RATIO)
            problems.push(`${plant}/${slug}#${id}: document too tall`);
          for (const heading of await headingLines(page)) {
            if (heading.lines > 2)
              problems.push(`${slug}#${id}: "${heading.text}" has ${heading.lines} lines`);
          }
        }
      }
      expect(problems).toEqual([]);
    });
  }
});

test.describe("phone", () => {
  const pixel = devices["Pixel 5"];
  test.use({
    viewport: pixel.viewport,
    userAgent: pixel.userAgent,
    deviceScaleFactor: pixel.deviceScaleFactor,
    isMobile: pixel.isMobile,
    hasTouch: pixel.hasTouch,
  });

  test("the server already renders the phone layout, so nothing re-chunks after hydration", async ({
    page,
    request,
  }) => {
    const path = "/handbook/orange/huanglongbing?nosplash";
    const phoneHtml = await (
      await request.get(path, { headers: { "sec-ch-ua-mobile": "?1" } })
    ).text();
    const desktopHtml = await (
      await request.get(path, { headers: { "sec-ch-ua-mobile": "?0" } })
    ).text();
    expect(phoneHtml).toContain('id="symptoms-2"');
    expect(desktopHtml).not.toContain('id="symptoms-2"');

    await page.goto(path);
    const before = await page.evaluate(() =>
      [...document.querySelectorAll(".panels__panel")].map((node) => node.id),
    );
    const after = await stablePanelIds(page);
    expect(after).toEqual(before);
    expect(await horizontalOverflow(page)).toBe(0);
  });

  test("tapping the dots moves between panels", async ({ page }) => {
    await page.goto("/handbook/tomato/early-blight?nosplash");
    await stablePanelIds(page);
    await page.getByRole("button", { name: "Go to Treatment" }).tap();
    await expect(page.locator("#treatment")).toHaveAttribute("data-active", "true");
    await expect(page.getByRole("heading", { name: /^Treatment/ })).toBeVisible();
  });
});
