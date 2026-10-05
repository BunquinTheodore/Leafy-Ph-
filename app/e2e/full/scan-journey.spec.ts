import { readFileSync } from "node:fs";
import {
  currentUserId,
  expect,
  newMember,
  photo,
  registerViaUi,
  scanObjectKeys,
  test,
  uniqueEmail,
} from "./support";

test.describe("register to scan to delete, against the real stack", () => {
  test("a new member verifies by email, scans a real leaf photo, gives feedback and deletes", async ({
    browser,
    baseURL,
  }) => {
    const member = await newMember(browser, baseURL ?? "", "scan");
    const { page } = member;
    try {
      await page.goto("/scan");
      await expect(page.getByRole("heading", { level: 1, name: "Scan a leaf" })).toBeVisible();
      await page.getByTestId("photo-input").setInputFiles(photo("tomato.jpg"));
      await expect(page.getByTestId("preview-image")).toBeVisible();
      await page.getByRole("button", { name: "Analyze leaf" }).click();

      // Progress, then a result of one of the three kinds.
      await expect(page.getByTestId("progress-panel")).toBeVisible();
      await expect(page.getByRole("progressbar")).toBeVisible();
      await expect(page.getByTestId("result-view")).toBeVisible({ timeout: 45_000 });
      await expect(page.getByRole("heading", { level: 1 })).not.toHaveText("");
      await expect(page).toHaveURL(/\/scan/);

      // The photo is stored under the member's own prefix.
      const userId = await currentUserId(page);
      expect(await scanObjectKeys(page.request, userId)).toHaveLength(1);

      // Feedback: yes is stored and survives a reload of the scan page.
      await page.getByTestId("feedback-yes").click();
      await expect(page.getByText("Thanks, this helps us improve.").first()).toBeVisible();
      await page.getByTestId("feedback-change").click();
      const dialog = page.getByRole("dialog", { name: "What is it really?" });
      await dialog.getByLabel("Plant").selectOption("tomato");
      await dialog.getByLabel(/Anything to add/).fill("Checked against the handbook");
      await dialog.getByTestId("feedback-send").click();
      await expect(dialog).toBeHidden();
      await expect(page.getByText("You said this result was not correct.").first()).toBeVisible();

      // History lists the scan and the dashboard counts it.
      await page.goto("/scans");
      await expect(page.getByTestId("history-card")).toHaveCount(1);
      await page.goto("/dashboard");
      await expect(page.getByTestId("result-split")).toBeVisible();
      await expect(page.getByTestId("recent-scans")).toBeVisible();
      await expect(page.getByTestId("scan-card")).toHaveCount(1);

      // Open the scan from history, then delete from history with Undo first.
      await page.goto("/scans");
      const card = page.getByTestId("history-card").first();
      await card.getByTestId("history-delete").click();
      const toast = page.getByRole("status").filter({ hasText: "Scan deleted." });
      await expect(toast).toBeVisible();
      await toast.getByRole("button", { name: "Undo" }).click();
      await expect(page.getByTestId("history-card")).toHaveCount(1);

      await page.getByTestId("history-card").first().getByTestId("history-delete").click();
      await expect(page.getByRole("heading", { name: "No scans yet" })).toBeVisible({
        timeout: 15_000,
      });
      // After the undo window the delete goes out and the object leaves storage.
      await expect
        .poll(async () => (await scanObjectKeys(page.request, userId)).length, { timeout: 30_000 })
        .toBe(0);
      await page.reload();
      await expect(page.getByRole("heading", { name: "No scans yet" })).toBeVisible();
    } finally {
      await member.close();
    }
  });

  test("a scan can be reopened from history and shows the same result", async ({
    browser,
    baseURL,
  }) => {
    const member = await newMember(browser, baseURL ?? "", "reopen");
    const { page } = member;
    try {
      await page.goto("/scan");
      await page.getByTestId("photo-input").setInputFiles(photo("apple.jpg"));
      await page.getByRole("button", { name: "Analyze leaf" }).click();
      await expect(page.getByTestId("result-view")).toBeVisible({ timeout: 45_000 });
      const title = (await page.getByRole("heading", { level: 1 }).textContent()) ?? "";

      await page.goto("/scans");
      await page.getByTestId("history-card").first().getByRole("link").first().click();
      await page.waitForURL(/\/scans\/[0-9a-f-]{36}$/);
      await expect(page.getByTestId("result-view")).toBeVisible();
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);
    } finally {
      await member.close();
    }
  });

  test("a new member can scan straight away, with no email step", async ({ page, baseURL }) => {
    await registerViaUi(page, { email: uniqueEmail("nogate") });
    await page.goto("/scan");
    await expect(page.getByTestId("photo-input")).toHaveCount(1);
    await expect(page.getByTestId("unverified-prompt")).toHaveCount(0);

    const reply = await page.request.post("/api/scans", {
      headers: { origin: baseURL ?? "" },
      multipart: {
        image: {
          name: "corn.jpg",
          mimeType: "image/jpeg",
          buffer: readFileSync(photo("corn.jpg")),
        },
      },
    });
    expect(reply.status()).toBe(202);
  });
});
