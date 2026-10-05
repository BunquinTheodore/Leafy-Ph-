import { expect, test, type Page } from "@playwright/test";
import {
  callsTo,
  choosePhoto,
  mockState,
  paddedPhoto,
  recordSteps,
  resetMock,
  seenSteps,
  signIn,
} from "./helpers";

test.beforeEach(async ({ context }) => {
  await resetMock();
  await signIn(context);
});

async function startScan(page: Page) {
  await page.goto("/scan");
  await choosePhoto(page);
  await expect(page.getByTestId("preview-image")).toBeVisible();
  await page.getByRole("button", { name: "Analyze leaf" }).click();
}

test.describe("scan page", () => {
  test("shows the tip card, the dropzone and both file inputs", async ({ page }) => {
    await page.goto("/scan");
    await expect(page.getByRole("heading", { level: 1, name: "Scan a leaf" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "A good leaf photo" })).toBeVisible();
    await expect(page.getByTestId("upload-photo")).toBeVisible();
    await expect(page.getByText("JPEG, PNG or WebP, up to 8 MB.")).toBeVisible();
    // The camera input asks phones for the rear camera.
    await expect(page.getByTestId("camera-input")).toHaveAttribute("capture", "environment");
    await expect(page.getByTestId("photo-input")).toHaveAttribute(
      "accept",
      "image/jpeg,image/png,image/webp",
    );
  });

  test("rejects a wrong file type and an oversized photo with a clear message", async ({
    page,
  }) => {
    await page.goto("/scan");
    await page
      .getByTestId("photo-input")
      .setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hello") });
    await expect(page.locator(".drop__problem")).toContainText("not supported");

    await page.getByTestId("photo-input").setInputFiles({
      name: "huge.jpg",
      mimeType: "image/jpeg",
      buffer: Buffer.alloc(9 * 1024 * 1024),
    });
    await expect(page.locator(".drop__problem")).toContainText("larger than 8 MB");
    expect((await callsTo("POST", "/scans")).length).toBe(0);
  });

  test("previews the photo and Retake goes back to the dropzone", async ({ page }) => {
    await page.goto("/scan");
    await choosePhoto(page);
    await expect(page.getByTestId("preview-image")).toBeVisible();
    await expect(page.getByText("Photo: leaf.jpg")).toBeVisible();
    await page.getByRole("button", { name: "Retake" }).click();
    await expect(page.getByTestId("upload-photo")).toBeVisible();
    expect((await callsTo("POST", "/scans")).length).toBe(0);
  });

  test("accepts a dropped photo", async ({ page }) => {
    await page.goto("/scan");
    const dataTransfer = await page.evaluateHandle(async () => {
      const response = await fetch("/icons/icon-192.png").catch(() => null);
      const blob = response?.ok ? await response.blob() : new Blob([new Uint8Array(8)]);
      const transfer = new DataTransfer();
      transfer.items.add(new File([blob], "drop.png", { type: "image/png" }));
      return transfer;
    });
    await page
      .getByRole("group", { name: "Photo of a leaf" })
      .dispatchEvent("drop", { dataTransfer });
    // Either the preview opens (valid image) or a clear message appears; never a silent failure.
    await expect(
      page.getByTestId("preview-image").or(page.locator(".drop__problem")),
    ).toBeVisible();
  });
});

test.describe("progress and results", () => {
  test("walks the stepper in order and lands on the disease result panels", async ({ page }) => {
    await recordSteps(page);
    await startScan(page);

    const panel = page.getByTestId("progress-panel");
    await expect(panel).toBeVisible();
    const bar = panel.getByRole("progressbar");
    await expect(bar).toHaveAttribute("aria-valuemax", "100");
    await expect(page.getByRole("list", { name: "Scan steps" })).toBeVisible();

    await expect(page.getByTestId("result-view")).toBeVisible({ timeout: 20_000 });
    const steps = await seenSteps(page);
    const expected = ["uploading", "checking", "analyzing", "saving"];
    let cursor = -1;
    for (const step of expected) {
      const at = steps.indexOf(step);
      expect(at, `${step} in ${steps.join(",")}`).toBeGreaterThan(cursor);
      cursor = at;
    }

    const title = page.getByRole("heading", { level: 1 });
    await expect(title).toContainText("Yellow Leaf Curl Virus");
    await expect(page.getByText("Moderate")).toBeVisible();
    await expect(page.getByText("91 percent")).toBeVisible();

    const dots = page.getByRole("list", { name: "Scan result panels" });
    for (const label of [
      "Result",
      "Causes",
      "Symptoms",
      "Treatment",
      "Prevention",
      "Reference photos",
    ]) {
      await expect(
        dots.getByRole("button", { name: new RegExp(`^Go to ${label}`) }).first(),
      ).toBeAttached();
    }
    // Eight treatment steps do not fit one panel, so they continue in a second one.
    await expect(dots.getByRole("button", { name: "Go to Treatment 2" })).toBeAttached();

    await dots.getByRole("button", { name: "Go to Causes" }).click();
    await expect(page.locator("#causes")).toHaveAttribute("data-active", "true");
    await expect(page.locator("#causes")).toContainText("A fungus that survives");
    await dots.getByRole("button", { name: "Go to Reference photos" }).click();
    await expect(page.locator("#photos")).toContainText("Reference photos coming soon");
  });

  test("shows real reference photos when the catalog has them", async ({ page }) => {
    await resetMock({ withImages: true });
    await startScan(page);
    await expect(page.getByTestId("result-view")).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: "Go to Reference photos" }).click();
    await expect(page.locator("#photos img")).toHaveCount(1);
  });

  test("healthy leaf shows reassurance and care tips", async ({ page }) => {
    await resetMock({ outcome: "healthy" });
    await startScan(page);
    await expect(page.getByRole("heading", { level: 1, name: "Healthy leaf" })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText("We did not find signs of disease on this leaf.")).toBeVisible();
    await page.getByRole("button", { name: "Go to Care tips" }).click();
    await expect(page.locator("#care")).toContainText("Keep it healthy");
  });

  test("unknown leaf gives a calm explanation and a retake guide", async ({ page }) => {
    await resetMock({ outcome: "unknown" });
    await startScan(page);
    await expect(page.getByRole("heading", { level: 1, name: "We could not tell" })).toBeVisible({
      timeout: 20_000,
    });
    await page.getByRole("button", { name: "Go to Retake guide" }).click();
    await expect(page.locator("#retake")).toContainText("Try a new photo");
    await expect(page.getByTestId("retake-cta")).toHaveAttribute("href", "/scan");
  });

  test("the bar never fakes 100 and reassurance appears after 8 seconds", async ({ page }) => {
    await resetMock({ timing: { validatingMs: 500, analyzingMs: 11_000, savingMs: 500 } });
    await startScan(page);
    const panel = page.getByTestId("progress-panel");
    await expect(panel).toHaveAttribute("data-step", "analyzing", { timeout: 10_000 });
    await expect(page.getByTestId("reassure")).toHaveCount(0);
    await expect(page.getByTestId("reassure")).toBeVisible({ timeout: 12_000 });
    await expect(page.getByTestId("reassure")).toContainText("Still analyzing");
    const now = Number(await panel.getByRole("progressbar").getAttribute("aria-valuenow"));
    expect(now).toBeLessThan(90);
    await expect(page.getByTestId("result-view")).toBeVisible({ timeout: 20_000 });
  });

  test("upload percentage is real and cancel stops the upload", async ({ page }) => {
    await resetMock({ uploadChunkDelayMs: 120 });
    await page.goto("/scan");
    await choosePhoto(page, paddedPhoto(5 * 1024 * 1024));
    await page.getByRole("button", { name: "Analyze leaf" }).click();
    const panel = page.getByTestId("progress-panel");
    await expect(panel).toHaveAttribute("data-step", "uploading");
    await expect(page.getByTestId("progress-detail")).toContainText("Uploading your photo");
    await expect(page.getByTestId("cancel-upload")).toBeVisible();
    await page.getByTestId("cancel-upload").click();
    await expect(page.getByText("Upload cancelled. Nothing was saved.")).toBeVisible();
    await expect(page.getByTestId("preview-image")).toBeVisible();
    await page.waitForTimeout(1500);
    expect((await mockState()).scans.length).toBe(0);
  });

  test("feedback: Yes is stored, No opens the picker and sends the right label", async ({
    page,
  }) => {
    await startScan(page);
    await expect(page.getByTestId("result-view")).toBeVisible({ timeout: 20_000 });
    await page.getByTestId("feedback-yes").click();
    await expect(page.getByText("Thanks, this helps us improve.").first()).toBeVisible();
    const puts = await callsTo("PUT", /\/scans\/.+\/feedback/);
    expect(puts.at(-1)?.body).toEqual({ is_correct: true });

    await page.getByTestId("feedback-change").click();
    const dialog = page.getByRole("dialog", { name: "What is it really?" });
    await expect(dialog).toBeVisible();
    await dialog.evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
    const box = await dialog.boundingBox();
    const view = page.viewportSize();
    expect(box && view).toBeTruthy();
    expect(Math.abs(box!.x + box!.width / 2 - view!.width / 2)).toBeLessThan(2);
    expect(Math.abs(box!.y + box!.height / 2 - view!.height / 2)).toBeLessThan(2);
    await dialog.getByLabel("Plant").selectOption("apple");
    await dialog.getByLabel("Problem").selectOption("apple-scab");
    await dialog.getByLabel(/Anything to add/).fill("Spots look like scab to me");
    await dialog.getByTestId("feedback-send").click();
    await expect(dialog).toBeHidden();
    const after = await callsTo("PUT", /\/scans\/.+\/feedback/);
    expect(after.at(-1)?.body).toEqual({
      is_correct: false,
      correct_plant: "apple",
      correct_disease: "apple-scab",
      comment: "Spots look like scab to me",
    });
  });

  test("Scan another returns to the dropzone", async ({ page }) => {
    await resetMock({ outcome: "healthy" });
    await startScan(page);
    await expect(page.getByTestId("result-view")).toBeVisible({ timeout: 20_000 });
    await page.getByTestId("scan-another").click();
    await expect(page.getByTestId("upload-photo")).toBeVisible();
  });
});

test.describe("failures and limits", () => {
  test("ml_unavailable shows the plain wording and Retry reuses the stored photo", async ({
    page,
  }) => {
    await resetMock({ outcome: "fail_ml", retryOutcome: "disease" });
    await startScan(page);
    const failed = page.getByTestId("failed-view");
    await expect(failed).toBeVisible({ timeout: 20_000 });
    await expect(failed).toContainText("Analysis isn't available right now");
    await expect(failed).toContainText("Your photo is saved");
    await page.getByTestId("retry-scan").click();
    await expect(page.getByTestId("result-view")).toBeVisible({ timeout: 20_000 });
    expect((await callsTo("POST", /\/scans\/.+\/retry/)).length).toBe(1);
    // The retry used the stored image: only one upload ever happened.
    expect((await callsTo("POST", "/scans")).length).toBe(1);
  });

  test("a failed analysis offers another photo", async ({ page }) => {
    await resetMock({ outcome: "fail_pred" });
    await startScan(page);
    await expect(page.getByTestId("failed-view")).toContainText("We could not analyze this photo", {
      timeout: 20_000,
    });
    await page.getByTestId("another-photo").click();
    await expect(page.getByTestId("upload-photo")).toBeVisible();
  });

  test("a member with an unverified address can scan like everyone else", async ({ page }) => {
    await resetMock({ user: { email_verified: false, email_verified_at: null } });
    await startScan(page);
    await expect(page.getByTestId("unverified-prompt")).toHaveCount(0);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByTestId("result-view")).toBeVisible({ timeout: 20_000 });
  });

  test("rate limiting shows a countdown and re-enables Try again", async ({ page }) => {
    await resetMock({
      createError: { status: 429, code: "rate_limited", message: "Too many.", retryAfter: 3 },
    });
    await startScan(page);
    const countdown = page.getByTestId("rate-limit-countdown");
    await expect(countdown).toContainText("You can scan again in");
    const retry = page.getByRole("button", { name: "Try again" });
    await expect(retry).toBeDisabled();
    await expect(countdown).toContainText("You can scan again now", { timeout: 8000 });
    await expect(retry).toBeEnabled();
  });

  test("quota exceeded points to the history", async ({ page }) => {
    await resetMock({
      createError: { status: 409, code: "scan_quota_exceeded", message: "Full." },
    });
    await startScan(page);
    const panel = page.getByTestId("scan-error");
    await expect(panel).toContainText("Your scan history is full");
    await expect(panel.getByRole("link", { name: "Open History" })).toHaveAttribute(
      "href",
      "/scans",
    );
  });

  test("an invalid image is explained and a new photo can be chosen", async ({ page }) => {
    await resetMock({
      createError: { status: 422, code: "invalid_image", message: "Bad image." },
    });
    await startScan(page);
    await expect(page.getByTestId("scan-error")).toContainText("We could not read that photo");
    await page.getByRole("button", { name: "Choose another photo" }).click();
    await expect(page.getByTestId("upload-photo")).toBeVisible();
  });
});

test.describe("leaving the page", () => {
  test("navigating away is safe: History shows the live badge and opening resumes", async ({
    page,
  }) => {
    await resetMock({ timing: { validatingMs: 500, analyzingMs: 6000, savingMs: 500 } });
    await startScan(page);
    await expect(page.getByTestId("progress-panel")).toHaveAttribute("data-step", "analyzing", {
      timeout: 10_000,
    });

    await page.getByRole("link", { name: "Open History" }).click();
    await expect(page).toHaveURL(/\/scans$/);
    const card = page.getByTestId("history-card").first();
    await expect(card).toHaveAttribute("data-status", "processing");
    await expect(card.getByText("Analyzing", { exact: true })).toBeVisible();

    await card.getByRole("link").click();
    await expect(page).toHaveURL(/\/scans\/[0-9a-f-]{36}$/);
    await expect(page.getByTestId("progress-panel")).toBeVisible();
    await expect(page.getByTestId("result-view")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Yellow Leaf Curl Virus");
  });

  test("a finished scan opens at /scans/[id] with the same panels", async ({ page }) => {
    await resetMock({ seed: 3 });
    const scanId = "00000000-0000-4000-8000-000000000001";
    await page.goto(`/scans/${scanId}`);
    await expect(page.getByTestId("result-view")).toBeVisible();
    await expect(page.getByRole("list", { name: "Scan result panels" })).toBeVisible();
  });

  test("an unknown scan id shows the not found page", async ({ page }) => {
    await page.goto("/scans/00000000-0000-4000-8000-0000000009ff");
    await expect(page.getByText("Page not found")).toBeVisible();
  });

  test("an expired photo link is refreshed when the image fails to load", async ({ page }) => {
    await resetMock({ seed: 3, expireFirstImage: true });
    const scanId = "00000000-0000-4000-8000-000000000002";
    await page.goto(`/scans/${scanId}`);
    await expect(page.getByTestId("result-view")).toBeVisible();
    const image = page.locator(".orbit__img");
    await expect
      .poll(
        async () => image.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0),
        {
          timeout: 15_000,
        },
      )
      .toBe(true);
    const reads = await callsTo("GET", `/scans/${scanId}`);
    // One read for the page itself and at least one more to get a fresh link.
    expect(reads.length).toBeGreaterThanOrEqual(2);
  });
});
