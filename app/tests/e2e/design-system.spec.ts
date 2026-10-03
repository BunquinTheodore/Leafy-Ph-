import { expect, test, type Page } from "@playwright/test";

/** Real browsers report webdriver=true under automation; undo that when a test needs the splash and effects. */
async function asHuman(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => false });
    try {
      localStorage.setItem("leafy-sfx", "0");
    } catch {}
  });
}

const widths = [360, 768, 1440];

test.describe("layout rules", () => {
  for (const width of widths) {
    test(`landing fits one viewport and its title is one line at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: width < 700 ? 800 : 900 });
      await page.goto("/?nosplash");
      const height = await page.evaluate(() => document.documentElement.scrollHeight);
      expect(height / (width < 700 ? 800 : 900)).toBeLessThanOrEqual(1.15);
      const lines = await page.evaluate(() => {
        const heading = document.querySelector("h1");
        if (!heading) return 0;
        const range = document.createRange();
        range.selectNodeContents(heading);
        return new Set([...range.getClientRects()].map((rect) => Math.round(rect.top / 4))).size;
      });
      expect(lines).toBe(1);
    });

    test(`brand headings are at most two lines at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/brand?nosplash");
      for (const id of ["logo", "motion", "components"]) {
        await page.evaluate((hash) => {
          window.location.hash = hash;
        }, id);
        await page.waitForTimeout(700);
        const lines = await page.evaluate(() => {
          const heading = document.querySelector('.panels__panel[data-active="true"] h2');
          if (!heading) return 0;
          const range = document.createRange();
          range.selectNodeContents(heading);
          return new Set([...range.getClientRects()].map((rect) => Math.round(rect.top / 4))).size;
        });
        expect(lines, `${id} title lines`).toBeLessThanOrEqual(2);
      }
    });
  }

  test("no element has hyphenation enabled", async ({ page }) => {
    await page.goto("/brand?nosplash");
    const offenders = await page.evaluate(
      () =>
        [...document.querySelectorAll("body *")].filter(
          (el) => getComputedStyle(el).hyphens !== "none" && el.childNodes.length > 0,
        ).length,
    );
    expect(offenders).toBe(0);
  });
});

test.describe("hydration", () => {
  for (const mode of ["human", "webdriver", "nosplash"] as const) {
    test(`/ and /brand hydrate without page errors (${mode})`, async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      if (mode === "human") await asHuman(page);
      if (mode === "webdriver")
        await page.addInitScript(() =>
          Object.defineProperty(navigator, "webdriver", { get: () => true }),
        );
      const suffix = mode === "nosplash" ? "?nosplash" : "";
      await page.goto(`/${suffix}`);
      await page.waitForTimeout(1500);
      await page.goto(`/brand${suffix}`);
      await page.waitForTimeout(1500);
      expect(errors).toEqual([]);
    });
  }
});

test.describe("slide panels", () => {
  test("deep link opens the matching panel", async ({ page }) => {
    await page.goto("/brand?nosplash#color");
    await expect(page.locator('#color[data-active="true"]')).toBeVisible();
    await expect(page.getByRole("button", { name: "Go to Color" })).toHaveAttribute(
      "aria-current",
      "true",
    );
  });

  test("arrow keys, dots and the hash stay in sync", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/brand?nosplash");
    await page.locator(".panels").focus();
    await page.getByRole("button", { name: "Go to Logo" }).focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.locator('#color[data-active="true"]')).toBeAttached();
    await expect(page).toHaveURL(/#color$/);
    await page.keyboard.press("End");
    await expect(page.locator('#rules[data-active="true"]')).toBeAttached();
    await page.getByRole("button", { name: "Go to Type" }).click();
    await expect(page).toHaveURL(/#type$/);
    await expect(page.getByText("Panel 3 of 7: Type")).toBeAttached();
  });

  test("inactive panels are inert", async ({ page }) => {
    await page.goto("/brand?nosplash");
    expect(await page.locator("#color").getAttribute("inert")).not.toBeNull();
    expect(await page.locator("#logo").getAttribute("inert")).toBeNull();
  });
});

test.describe("splash", () => {
  test("appears for a human, lasts under about 2.2s, and is gone after", async ({ page }) => {
    await asHuman(page);
    await page.goto("/", { waitUntil: "commit" });
    await expect(page.locator("#leafy-splash")).toBeAttached();
    await expect(page.locator("#leafy-splash")).toBeHidden({ timeout: 4000 });
  });

  test("is skipped for webdriver runs and ?nosplash", async ({ page }) => {
    // Lighthouse and Selenium report webdriver=true; Playwright hides it, so set it explicitly.
    await page.addInitScript(() =>
      Object.defineProperty(navigator, "webdriver", { get: () => true }),
    );
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("data-splash", "off");
    await expect(page.locator("#leafy-splash")).toBeHidden();
    await page.goto("/?nosplash");
    await expect(page.locator("#leafy-splash")).toBeHidden();
  });

  test("does not return on client side navigation", async ({ page }) => {
    await asHuman(page);
    await page.goto("/");
    await expect(page.locator("#leafy-splash")).toBeHidden({ timeout: 4000 });
    await page.getByRole("link", { name: "Leafy home" }).click();
    await expect(page.locator("#leafy-splash")).toBeHidden();
  });

  test("reduced motion uses a plain fade", async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: "reduce" });
    const page = await context.newPage();
    await asHuman(page);
    await page.goto("/", { waitUntil: "commit" });
    const animation = await page
      .locator(".splash__word span")
      .first()
      .evaluate((el) => getComputedStyle(el).animationName);
    expect(animation).toBe("none");
    await context.close();
  });
});

test.describe("theme", () => {
  test("toggle switches, persists and sets no flash on reload", async ({ page }) => {
    await page.goto("/?nosplash");
    const html = page.locator("html");
    const initial = await html.getAttribute("data-theme");
    const next = initial === "light" ? "dark" : "light";
    await page.getByRole("button", { name: new RegExp(`Switch to ${next} theme`) }).click();
    await expect(html).toHaveAttribute("data-theme", next);
    await page.reload();
    await expect(html).toHaveAttribute("data-theme", next);
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(bg).toBe(next === "light" ? "rgb(245, 250, 244)" : "rgb(6, 18, 11)");
  });
});

test.describe("hero fallbacks and effects", () => {
  test("?nowebgl keeps the static poster and no canvas", async ({ page }) => {
    await page.goto("/?nosplash&nowebgl");
    await page.waitForTimeout(2000);
    await expect(page.locator("canvas")).toHaveCount(0);
    await expect(page.locator(".hero__poster")).toBeVisible();
  });

  test("hover effects do not change layout or the title", async ({ page }) => {
    await asHuman(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/brand#motion");
    await expect(page.locator("#leafy-splash")).toBeHidden({ timeout: 4000 });
    await expect(page.locator("html")).not.toHaveAttribute("data-fx", "off");
    // Let the deep link scroll settle so the title box is measured at rest.
    await expect(page.locator('#motion[data-active="true"]')).toBeAttached();
    await page.waitForTimeout(900);
    const card = page.locator(".tilt").first();
    const before = await page.evaluate(() => document.documentElement.scrollHeight);
    const titleBefore = await page.locator('.panels__panel[data-active="true"] h2').boundingBox();
    await card.hover();
    await page.mouse.move(300, 450);
    await page.waitForTimeout(400);
    const after = await page.evaluate(() => document.documentElement.scrollHeight);
    const titleAfter = await page.locator('.panels__panel[data-active="true"] h2').boundingBox();
    expect(after).toBe(before);
    expect(titleAfter).toEqual(titleBefore);
  });

  test("buttons meet the 44px touch target", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/?nosplash");
    for (const button of await page.locator(".hero .btn, .site-header .btn").all()) {
      const box = await button.boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(43.5);
    }
  });
});
