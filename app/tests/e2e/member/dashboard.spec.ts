import { expect, test } from "@playwright/test";
import { resetMock, signIn } from "./helpers";

test.beforeEach(async ({ context }) => {
  await resetMock();
  await signIn(context);
});

test.describe("dashboard", () => {
  test("shows totals, the result split, top diseases and recent scans", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();
    await expect(page.getByText("Welcome back, Ada")).toBeVisible();

    await expect(page.getByText("Total scans").locator("xpath=following-sibling::*[1]")).toHaveText(
      "5",
    );
    await expect(
      page.getByText("Last 30 days").locator("xpath=following-sibling::*[1]"),
    ).toHaveText("5");

    const split = page.getByTestId("result-split");
    await expect(split.getByRole("listitem").filter({ hasText: "Healthy" })).toContainText("1");
    await expect(split.getByRole("listitem").filter({ hasText: "Disease found" })).toContainText(
      "3",
    );
    await expect(split.getByRole("listitem").filter({ hasText: "Unclear" })).toContainText("1");

    const top = page.getByTestId("top-diseases");
    const rows = top.getByRole("listitem");
    await expect(rows).toHaveCount(2);
    await expect(rows.first()).toContainText("Early blight");
    await expect(rows.first()).toContainText("2");

    const recent = page.getByTestId("recent-scans");
    await expect(recent.getByTestId("scan-card")).toHaveCount(5);
    await expect(recent.getByRole("link", { name: "See all scans" })).toHaveAttribute(
      "href",
      "/scans",
    );

    await expect(page.locator("#main").getByRole("link", { name: "Scan a leaf" })).toHaveAttribute(
      "href",
      "/scan",
    );
  });

  test("recent scans open the scan", async ({ page }) => {
    await page.goto("/dashboard");
    const first = page.getByTestId("scan-card").first();
    await expect(first).toHaveAttribute("href", "/scans/s1");
  });

  test("a processing scan updates its badge without a reload", async ({ page }) => {
    await resetMock({
      scans: [
        {
          id: "live1",
          status: "processing",
          stage: "analyzing",
          failure_code: null,
          verdict: null,
          plant: { slug: "tomato", name: "Tomato" },
          disease: null,
          confidence: null,
          created_at: "2026-10-04T08:00:00Z",
          image_url: null,
        },
        {
          id: "done1",
          status: "completed",
          stage: null,
          failure_code: null,
          verdict: "healthy",
          plant: { slug: "basil", name: "Basil" },
          disease: null,
          confidence: null,
          created_at: "2026-10-03T08:00:00Z",
          image_url: null,
        },
      ],
      // The first list call is the server render; the second (the first poll) finishes the scan.
      completeAfterListCalls: 2,
    });
    await page.goto("/dashboard");
    const live = page.getByTestId("scan-card").first();
    await expect(live).toHaveAttribute("data-status", "processing");
    await expect(live.getByText("Analyzing leaf")).toBeVisible();
    await expect(live.getByRole("progressbar")).toBeVisible();

    await expect(live).toHaveAttribute("data-status", "completed", { timeout: 15_000 });
    await expect(live.getByText("Healthy")).toBeVisible();
    await expect(live.getByRole("progressbar")).toHaveCount(0);
  });

  test("shows the failure reason for a scan when analysis is unavailable", async ({ page }) => {
    await resetMock({
      scans: [
        {
          id: "bad1",
          status: "failed",
          stage: null,
          failure_code: "ml_unavailable",
          verdict: null,
          plant: null,
          disease: null,
          confidence: null,
          created_at: "2026-10-04T08:00:00Z",
          image_url: null,
        },
      ],
    });
    await page.goto("/dashboard");
    await expect(page.getByTestId("scan-card").first()).toContainText(
      "Analysis isn't available right now",
    );
  });

  test("guides a new member to the first scan", async ({ page }) => {
    await resetMock({ scans: [] });
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: "Scan your first leaf" })).toBeVisible();
    await expect(page.locator("#main").getByRole("link", { name: "Scan a leaf" })).toHaveAttribute(
      "href",
      "/scan",
    );
    await expect(page.getByTestId("result-split")).toHaveCount(0);
  });

  test("explains a failed summary and offers a reload", async ({ page }) => {
    await resetMock({ statsFail: true });
    await page.goto("/dashboard");
    await expect(page.getByText("We could not load your summary")).toBeVisible();
    await expect(page.getByRole("link", { name: "Reload" })).toBeVisible();
  });

  test("renders the 3D ring or its flat fallback, never an empty hole", async ({ page }) => {
    await page.goto("/dashboard");
    const orb = page.locator(".orb");
    await expect(orb).toBeVisible();
    // Poster donut is always there; the canvas fades in over it when WebGL works.
    await expect(orb.locator(".orb__seg")).toHaveCount(3);
    await page.waitForTimeout(2500);
    const ready = await orb.getAttribute("data-ready");
    test.info().annotations.push({ type: "orb", description: `data-ready=${ready}` });
    const box = await orb.boundingBox();
    expect(box?.width ?? 0).toBeGreaterThan(80);
    expect(box?.height ?? 0).toBeGreaterThan(80);
  });
});
