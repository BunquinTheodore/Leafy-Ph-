import { expect, newMember, photo, test } from "./support";

/** Runs against the second stack, whose API uses ML_SERVICE=stub (the unimplemented real model). */
test("with the stub model a scan fails with the friendly message and keeps the photo", async ({
  browser,
  baseURL,
}) => {
  const member = await newMember(browser, baseURL ?? "", "stub");
  const { page } = member;
  try {
    await page.goto("/scan");
    await page.getByTestId("photo-input").setInputFiles(photo("cherry.jpg"));
    await page.getByRole("button", { name: "Analyze leaf" }).click();

    const failed = page.getByTestId("failed-view");
    await expect(failed).toBeVisible({ timeout: 45_000 });
    await expect(failed).toContainText("Analysis isn't available right now");
    await expect(failed).toContainText("Your photo is saved");
    await expect(page.getByTestId("result-view")).toHaveCount(0);
    // No internal detail leaks to the page.
    await expect(page.locator("body")).not.toContainText(/NotImplementedError|traceback/i);

    // History lists it as failed, with the same wording.
    await page.goto("/scans");
    const card = page.getByTestId("history-card").first();
    await expect(card).toContainText("Analysis isn't available right now");

    // Retry reuses the stored photo and fails the same plain way.
    await card.getByRole("link").first().click();
    await page.getByTestId("retry-scan").click();
    await expect(page.getByTestId("failed-view")).toContainText(
      "Analysis isn't available right now",
      { timeout: 45_000 },
    );
  } finally {
    await member.close();
  }
});
