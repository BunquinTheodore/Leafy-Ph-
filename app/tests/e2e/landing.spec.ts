import { expect, test } from "@playwright/test";
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
} from "./helpers";

const PANELS = ["hero", "how-it-works", "plants", "why-leafy", "faq", "start"];
const titles: Record<string, string> = {
  "how-it-works": "How it works",
  "why-leafy": "Why Leafy",
  start: "Start",
};

test.describe("landing journey", () => {
  test("shows the six panels and moves sideways with the keyboard", async ({ page }) => {
    await page.goto("/?nosplash");
    const carousel = page.getByRole("region", { name: "Leafy introduction" });
    await expect(carousel.locator(".panels__panel")).toHaveCount(6);
    await expect(page.getByRole("heading", { level: 1, name: /know your leaf/i })).toBeVisible();

    await focusCarousel(page);
    await page.keyboard.press("ArrowRight");
    await expect(page.locator("#how-it-works")).toHaveAttribute("data-active", "true");
    await expect(
      page.getByRole("heading", { name: "From leaf to answer in three steps" }),
    ).toBeVisible();
    await page.keyboard.press("End");
    await expect(page.locator("#start")).toHaveAttribute("data-active", "true");
    // At the last panel the Next button is disabled, so move focus back inside the carousel.
    await page.getByRole("button", { name: "Previous panel" }).focus();
    await page.keyboard.press("Home");
    await expect(page.locator("#hero")).toHaveAttribute("data-active", "true");
  });

  test("opens a panel from its hash link", async ({ page }) => {
    await page.goto("/?nosplash#faq");
    await expect(page.locator("#faq")).toHaveAttribute("data-active", "true");
    await expect(
      page.getByRole("heading", { name: "Good questions, short answers" }),
    ).toBeVisible();
  });

  test("opens one FAQ answer at a time", async ({ page }) => {
    await page.goto("/?nosplash#faq");
    // The first answer starts open so the panel is not a bare list of questions.
    await expect(page.getByText(/known disease, looks healthy/)).toBeVisible();
    await page.getByText("Do I need an account?").click();
    await expect(page.getByText(/known disease, looks healthy/)).toBeHidden();
    await expect(page.getByText(/read the whole handbook without one/)).toBeVisible();
  });

  test("lists the plants and links to the handbook", async ({ page }) => {
    await page.goto("/?nosplash#plants");
    await expect(page.locator("#plants .thumb:not(.thumb--all)")).toHaveCount(13);
    await page.getByRole("link", { name: "Tomato" }).first().click();
    await expect(page).toHaveURL(/\/handbook\/tomato$/);
  });

  test("the calls to action go to scan and the handbook", async ({ page }) => {
    await page.goto("/?nosplash#start");
    await expect(page.getByRole("link", { name: "Scan a leaf" }).last()).toHaveAttribute(
      "href",
      "/scan",
    );
    await page.getByRole("link", { name: "Browse the handbook" }).last().click();
    await expect(page).toHaveURL(/\/handbook$/);
  });

  test("copy has no exclamation marks and no hyphenation", async ({ page }) => {
    await page.goto("/?nosplash");
    const text = await page.locator("main").innerText();
    expect(text).not.toContain("!");
    expect(await hyphenationOffenders(page)).toBe(0);
  });

  test("each panel scene takes over the single canvas when it is reached sideways", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/?nosplash&webgl");
    const webgl = await page.evaluate(() =>
      Boolean(document.createElement("canvas").getContext("webgl2")),
    );
    test.skip(!webgl, "WebGL is not available in this browser");
    await expect(page.locator(".hero__scene")).toHaveAttribute("data-ready", "true", {
      timeout: 15_000,
    });
    for (const id of ["how-it-works", "why-leafy", "start"]) {
      await page.getByRole("button", { name: `Go to ${titles[id]}` }).click();
      await expect(page.locator(`#${id} .lp-scene`)).toHaveAttribute("data-ready", "true", {
        timeout: 15_000,
      });
      expect(await page.locator("canvas").count()).toBe(1);
    }
  });

  test("one WebGL canvas at most, and the poster only without WebGL", async ({ page }) => {
    await page.goto("/?nosplash&nowebgl");
    await page.waitForTimeout(1500);
    await expect(page.locator("canvas")).toHaveCount(0);
    await expect(page.locator(".hero__poster")).toBeVisible();
  });
});

for (const viewport of VIEWPORTS) {
  test.describe(`landing layout at ${viewport.name}px`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test("every panel fits the viewport with short titles", async ({ page }) => {
      await page.goto("/?nosplash");
      expect(await horizontalOverflow(page)).toBe(0);
      for (const id of PANELS) {
        await goToPanel(page, id);
        expect(await documentRatio(page), `${id} document height`).toBeLessThanOrEqual(
          MAX_DOCUMENT_RATIO,
        );
        expect(await activePanelOverflow(page), `${id} vertical overflow`).toBeLessThanOrEqual(1);
        for (const heading of await headingLines(page)) {
          const limit = id === "hero" ? 1 : 2;
          expect(heading.lines, `${id}: "${heading.text}"`).toBeLessThanOrEqual(limit);
        }
      }
    });
  });
}
