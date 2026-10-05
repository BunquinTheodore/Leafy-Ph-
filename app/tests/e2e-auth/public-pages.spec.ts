import { expect, test } from "@playwright/test";
import { lineCount } from "./support/helpers";

test.describe("about, privacy and terms", () => {
  const pages = [
    { path: "/about", h1: "About Leafy", first: "what-leafy-is", panels: 3 },
    { path: "/privacy", h1: "Privacy Policy", first: "contents", panels: 8 },
    { path: "/terms", h1: "Terms of Use", first: "contents", panels: 7 },
  ];

  for (const { path, h1, first, panels } of pages) {
    test(`${path} has one h1, sideways panels and keyboard navigation`, async ({ page }) => {
      await page.goto(`${path}?nosplash`);
      await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(h1);
      await expect(page.locator(".panels__panel")).toHaveCount(panels);
      await expect(page.locator(`#${first}[data-active="true"]`)).toBeAttached();

      await page
        .getByRole("button", { name: /^Go to / })
        .first()
        .focus();
      await page.keyboard.press("ArrowRight");
      await expect(page.locator('.panels__panel[data-active="true"]')).not.toHaveAttribute(
        "id",
        first,
      );
      await page.keyboard.press("End");
      await expect(page).toHaveURL(/#[a-z-]+$/);
    });
  }

  test("legal pages are marked as drafts and show a contents list that deep links", async ({
    page,
  }) => {
    await page.goto("/privacy?nosplash");
    await expect(page.locator(".doc-draft")).toBeVisible();
    await expect(page.getByText(/not legal advice/)).toBeVisible();
    const contents = page.getByRole("navigation", { name: "Contents" });
    await contents.getByRole("link", { name: "Your scan photos" }).click();
    await expect(page).toHaveURL(/#scan-photos$/);
    await expect(page.locator('#scan-photos[data-active="true"]')).toBeAttached();
    await expect(page.getByRole("heading", { level: 2, name: "Your scan photos" })).toBeVisible();
  });

  test("a deep link opens the matching section", async ({ page }) => {
    await page.goto("/terms?nosplash#results-and-limits");
    await expect(page.locator('#results-and-limits[data-active="true"]')).toBeAttached();
  });

  test("about and the footer carry no origin story", async ({ page }) => {
    await page.goto("/about?nosplash");
    await expect(page.getByText(/Dahon means leaf in Filipino/)).toHaveCount(0);
    await expect(page.locator(".site-footer")).not.toContainText("DAHON");
  });

  test("panel titles stay within two lines at phone, tablet and desktop widths", async ({
    page,
  }) => {
    for (const width of [360, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      for (const path of ["/about", "/privacy", "/terms"]) {
        await page.goto(`${path}?nosplash`);
        expect(await lineCount(page, "h1"), `${path} h1 at ${width}`).toBeLessThanOrEqual(2);
        const panelCount = await page.locator(".panels__panel").count();
        for (let index = 1; index < panelCount; index += 1) {
          await page.keyboard.press("End");
        }
        expect(
          await lineCount(page, '.panels__panel[data-active="true"] h2'),
          `${path} last panel title at ${width}`,
        ).toBeLessThanOrEqual(2);
      }
    }
  });
});

test.describe("footer", () => {
  test("links the public pages on every route", async ({ page }) => {
    for (const path of ["/", "/login", "/about"]) {
      await page.goto(`${path}?nosplash`);
      const footer = page.getByRole("navigation", { name: "Footer" });
      for (const [name, href] of [
        ["About", "/about"],
        ["Privacy", "/privacy"],
        ["Terms", "/terms"],
        ["Handbook", "/handbook"],
      ] as const) {
        await expect(footer.getByRole("link", { name })).toHaveAttribute("href", href);
      }
    }
  });
});

test.describe("404", () => {
  test("is calm and offers a way out", async ({ page }) => {
    const response = await page.goto("/this-page-does-not-exist?nosplash");
    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Page not found");
    await expect(page.getByRole("link", { name: "Go to the home page" })).toHaveAttribute(
      "href",
      "/",
    );
    await expect(page.getByRole("link", { name: "Browse the handbook" })).toBeVisible();
    const robots = await page
      .locator('meta[name="robots"]')
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("content") ?? ""));
    expect(robots.some((value) => value.includes("noindex"))).toBe(true);
  });
});

test.describe("SEO", () => {
  test("pages have canonical, Open Graph and Twitter metadata", async ({ page }) => {
    await page.goto("/about?nosplash");
    const origin = new URL(page.url()).origin;
    await expect(page).toHaveTitle("About | Leafy");
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", `${origin}/about`);
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
      "content",
      "About | Leafy",
    );
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
      "content",
      `${origin}/og/og-image.png`,
    );
    await expect(page.locator('meta[property="og:url"]')).toHaveAttribute(
      "content",
      `${origin}/about`,
    );
    await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute(
      "content",
      "summary_large_image",
    );
    await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", /Leafy/);
  });

  test("JSON-LD describes the site, the organization and the about page", async ({ page }) => {
    await page.goto("/about?nosplash");
    const types = await page.$$eval('script[type="application/ld+json"]', (nodes) =>
      nodes.map((node) => (JSON.parse(node.textContent ?? "{}") as { "@type": string })["@type"]),
    );
    expect(types).toEqual(expect.arrayContaining(["WebSite", "Organization", "AboutPage"]));
  });

  test("the removed email pages are gone and login stays indexable", async ({ request, page }) => {
    for (const path of ["/forgot-password", "/reset-password", "/verify-email"]) {
      expect((await request.get(path)).status(), path).toBe(404);
    }
    await page.goto("/login?nosplash");
    await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
  });

  test("robots.txt disallows private routes and points at the sitemap", async ({
    request,
    baseURL,
  }) => {
    const response = await request.get("/robots.txt");
    expect(response.status()).toBe(200);
    const text = await response.text();
    for (const path of ["/api/", "/brand", "/dashboard", "/scan", "/account"]) {
      expect(text).toContain(`Disallow: ${path}`);
    }
    expect(text).toContain("Allow: /");
    expect(text).toContain(`Sitemap: ${baseURL}/sitemap.xml`);
  });

  test("sitemap.xml lists public pages and the catalog, never private pages", async ({
    request,
    baseURL,
  }) => {
    const response = await request.get("/sitemap.xml");
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toMatch(/xml/);
    const xml = await response.text();
    for (const path of [
      "/",
      "/handbook",
      "/about",
      "/privacy",
      "/terms",
      "/handbook/tomato",
      "/handbook/tomato/early-blight",
    ]) {
      expect(xml, path).toContain(`<loc>${baseURL}${path}</loc>`);
    }
    for (const path of ["/dashboard", "/login", "/brand", "/api"]) {
      expect(xml, path).not.toContain(`<loc>${baseURL}${path}`);
    }
  });
});

test.describe("PWA and device metadata", () => {
  test("the manifest is linked, valid and its icons load", async ({ page, request }) => {
    await page.goto("/about?nosplash");
    const href = await page.locator('link[rel="manifest"]').getAttribute("href");
    expect(href).toBe("/manifest.webmanifest");
    const manifest = await (await request.get(href as string)).json();
    expect(manifest).toMatchObject({ name: "Leafy", display: "standalone", id: "/" });
    for (const icon of manifest.icons as Array<{ src: string }>) {
      expect((await request.get(icon.src)).status(), icon.src).toBe(200);
    }
  });

  test("iOS and theme meta tags are present", async ({ page }) => {
    await page.goto("/about?nosplash");
    await expect(page.locator('meta[name="apple-mobile-web-app-capable"]')).toHaveAttribute(
      "content",
      "yes",
    );
    await expect(page.locator('meta[name="mobile-web-app-capable"]')).toHaveAttribute(
      "content",
      "yes",
    );
    await expect(
      page.locator('meta[name="apple-mobile-web-app-status-bar-style"]'),
    ).toHaveAttribute("content", "black-translucent");
    await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute(
      "href",
      /apple-touch-icon\.png/,
    );
    await expect(page.locator('meta[name="theme-color"]')).toHaveCount(2);
    await expect(page.locator('meta[name="format-detection"]')).toHaveAttribute(
      "content",
      /telephone=no/,
    );
  });
});
