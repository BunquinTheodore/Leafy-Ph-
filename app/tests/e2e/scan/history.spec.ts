import { expect, test } from "@playwright/test";
import { callsTo, mockState, resetMock, signIn } from "./helpers";

const SCAN_1 = "00000000-0000-4000-8000-000000000001";

test.beforeEach(async ({ context }) => {
  await signIn(context);
});

test.describe("history list", () => {
  test("pages with Load more using the keyset cursor", async ({ page }) => {
    await resetMock({ seed: 15 });
    await page.goto("/scans");
    const cards = page.getByTestId("history-card");
    await expect(cards).toHaveCount(12);
    await expect(page.getByRole("status").filter({ hasText: "12 scans shown" })).toBeAttached();

    await page.getByTestId("load-more").click();
    await expect(cards).toHaveCount(15);
    await expect(page.getByTestId("load-more")).toHaveCount(0);

    const calls = await callsTo("GET", "/scans");
    const withCursor = calls.filter((call) => call.query.includes("cursor="));
    expect(withCursor.length).toBe(1);
    expect(withCursor[0]?.query).toContain("limit=12");
  });

  test("filters by result and by plant through the API", async ({ page }) => {
    await resetMock({ seed: 15 });
    await page.goto("/scans");
    await expect(page.getByTestId("history-card")).toHaveCount(12);

    await page.getByTestId("filter-verdict").selectOption("healthy");
    await expect(page.getByTestId("history-card")).toHaveCount(5);
    for (const card of await page.getByTestId("history-card").all()) {
      await expect(card).toHaveAttribute("data-verdict", "healthy");
    }
    expect(
      (await callsTo("GET", "/scans")).some((call) => call.query.includes("verdict=healthy")),
    ).toBe(true);

    await page.getByTestId("filter-verdict").selectOption("");
    await expect(page.getByTestId("history-card")).toHaveCount(12);
    await page.getByTestId("filter-plant").selectOption("tomato");
    await expect
      .poll(async () =>
        (await callsTo("GET", "/scans")).some((call) => call.query.includes("plant=tomato")),
      )
      .toBe(true);
    await expect(page.getByTestId("history-card")).toHaveCount(5);

    await page.getByTestId("filter-plant").selectOption("grape");
    await expect(page.getByRole("heading", { name: "No scans match these filters" })).toBeVisible();
    await page.getByRole("button", { name: "Clear filters" }).click();
    await expect(page.getByTestId("history-card").first()).toBeVisible();
  });

  test("the grid toggle switches the layout and is remembered", async ({ page }) => {
    await resetMock({ seed: 5 });
    await page.goto("/scans");
    await expect(page.getByTestId("history-list")).toHaveClass(/hist__rail/);
    await page.getByRole("button", { name: "Grid", exact: true }).click();
    await expect(page.getByRole("button", { name: "Grid", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.getByTestId("history-list")).toHaveClass(/hist__grid/);
    await page.reload();
    await expect(page.getByTestId("history-list")).toHaveClass(/hist__grid/);
  });

  test("the rail pages sideways with the arrows", async ({ page }) => {
    await resetMock({ seed: 12 });
    await page.setViewportSize({ width: 1000, height: 800 });
    await page.goto("/scans");
    const rail = page.getByTestId("history-list");
    await expect(rail).toBeVisible();
    const before = await rail.evaluate((el) => el.scrollLeft);
    await page.getByRole("button", { name: "Later scans" }).click();
    await expect.poll(() => rail.evaluate((el) => el.scrollLeft)).toBeGreaterThan(before);
  });

  test("shows an empty state with one next action", async ({ page }) => {
    await resetMock({ seed: 0 });
    await page.goto("/scans");
    await expect(page.getByRole("heading", { name: "No scans yet" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Scan a leaf" }).last()).toHaveAttribute(
      "href",
      "/scan",
    );
  });

  test("explains a list that could not load", async ({ page }) => {
    await resetMock({ seed: 3, listFail: true });
    await page.goto("/scans");
    await expect(page.getByText("We could not load your scans")).toBeVisible();
    await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
  });

  test("failed and running scans show plain status badges", async ({ page }) => {
    await resetMock({ seed: 4, seedKinds: ["fail_ml", "fail_pred", "healthy", "disease"] });
    await page.goto("/scans");
    const cards = page.getByTestId("history-card");
    await expect(cards.first()).toHaveAttribute("data-status", "failed");
    await expect(cards.first()).toContainText("Analysis isn't available right now");
    await expect(cards.nth(1)).toContainText("Failed");
  });
});

test.describe("delete with undo", () => {
  test("Undo within the window keeps the scan and sends no delete", async ({ page }) => {
    await resetMock({ seed: 4 });
    await page.goto("/scans");
    const cards = page.getByTestId("history-card");
    await expect(cards).toHaveCount(4);
    await cards.first().getByTestId("history-delete").click();
    await expect(cards).toHaveCount(3);
    const toast = page.getByRole("status").filter({ hasText: "Scan deleted." });
    await expect(toast).toBeVisible();
    await toast.getByRole("button", { name: "Undo" }).click();
    await expect(cards).toHaveCount(4);
    await page.waitForTimeout(7000);
    expect((await callsTo("DELETE", /^\/scans\/[^/]+$/)).length).toBe(0);
    expect((await mockState()).scans.length).toBe(4);
  });

  test("without Undo the delete is sent after about six seconds", async ({ page }) => {
    await resetMock({ seed: 4 });
    await page.goto("/scans");
    const cards = page.getByTestId("history-card");
    await cards.first().getByTestId("history-delete").click();
    await expect(cards).toHaveCount(3);
    await page.waitForTimeout(3000);
    expect((await callsTo("DELETE", /^\/scans\/[^/]+$/)).length).toBe(0);
    await expect
      .poll(async () => (await callsTo("DELETE", /^\/scans\/[^/]+$/)).length, { timeout: 8000 })
      .toBe(1);
    await page.reload();
    await expect(cards).toHaveCount(3);
  });

  test("a failed delete brings the scan back with a message", async ({ page }) => {
    await resetMock({ seed: 3, deleteFail: true });
    await page.goto("/scans");
    const cards = page.getByTestId("history-card");
    await cards.first().getByTestId("history-delete").click();
    await expect(cards).toHaveCount(2);
    await expect(page.getByText("We could not delete that scan. Try again.")).toBeVisible({
      timeout: 10_000,
    });
    await expect(cards).toHaveCount(3);
  });

  test("deleting from a scan goes back to the list and Undo restores it", async ({ page }) => {
    await resetMock({ seed: 3 });
    await page.goto(`/scans/${SCAN_1}`);
    await page.getByTestId("delete-scan").click();
    await expect(page).toHaveURL(/\/scans$/);
    await expect(page.getByTestId("history-card")).toHaveCount(2);
    await page
      .getByRole("status")
      .filter({ hasText: "Scan deleted." })
      .getByRole("button", { name: "Undo" })
      .click();
    await expect(page.getByTestId("history-card")).toHaveCount(3);
    expect((await callsTo("DELETE", /^\/scans\/[^/]+$/)).length).toBe(0);
  });
});
