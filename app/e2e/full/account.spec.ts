import type { Page } from "@playwright/test";
import {
  currentUserId,
  expect,
  newMember,
  PASSWORD,
  photo,
  registerViaUi,
  runPurgeJob,
  scanObjectKeys,
  signInViaUi,
  test,
  uniqueEmail,
} from "./support";

async function openPanel(page: Page, id: "profile" | "password" | "danger") {
  await page.goto(`/account#${id}`);
  const label = { profile: "Profile", password: "Password", danger: "Danger zone" }[id];
  const panel = page.getByRole("group", { name: new RegExp(`: ${label}$`) });
  await expect(panel).toHaveAttribute("data-active", "true");
  return panel;
}

type Panel = ReturnType<Page["getByRole"]>;

/**
 * Fills the danger zone form and opens the confirmation dialog. The panel can re-render right
 * after navigation or a failed attempt and reset the form, so retry until the dialog opens.
 */
async function openDeleteDialog(page: Page, panel: Panel, password: string): Promise<void> {
  await expect(async () => {
    await panel.getByLabel("Password", { exact: true }).fill(password);
    await panel.getByLabel("Type DELETE to confirm").fill("DELETE");
    await panel.getByRole("button", { name: "Delete my account" }).click();
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
}

test.describe("account", () => {
  test("edit the profile and change the password with the current one", async ({ page }) => {
    const email = uniqueEmail("acct");
    await registerViaUi(page, { email });

    const profile = await openPanel(page, "profile");
    await profile.getByLabel("First name").fill("Grace");
    await profile.getByLabel("Last name").fill("Hopper");
    await profile.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Profile saved." })).toBeVisible();
    await expect(page.getByRole("button", { name: "Open account menu" })).toHaveText("GH");

    const panel = await openPanel(page, "password");
    await panel.getByLabel("Current password").fill("definitely not it");
    await panel.getByLabel("New password").fill("a brand new phrase 77");
    await panel.getByRole("button", { name: "Change password" }).click();
    await expect(
      panel.getByText("That password is not correct. Check it and try again."),
    ).toBeVisible();

    await panel.getByLabel("Current password").fill(PASSWORD);
    await panel.getByRole("button", { name: "Change password" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Password changed." })).toBeVisible();

    // Signed out: the old password fails, the new one works.
    await page.context().clearCookies();
    await page.goto("/login");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.locator("form").getByRole("alert")).toContainText(/do not match/);
    await signInViaUi(page, email, "a brand new phrase 77");
  });

  test("a Google only member sets a first password and then signs in with it", async ({ page }) => {
    const email = uniqueEmail("google.pw");
    await page.goto(`/api/auth/google?email=${encodeURIComponent(email)}`);
    await page.waitForURL("**/dashboard");

    const panel = await openPanel(page, "password");
    await expect(panel.getByRole("heading", { name: "Set a password" })).toBeVisible();
    await expect(panel.getByLabel("Current password")).toHaveCount(0);
    await panel.getByLabel("New password").fill("a first password 88");
    await panel.getByRole("button", { name: "Set password" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Password set." })).toBeVisible();
    await expect(panel.getByLabel("Current password")).toBeVisible();

    await page.context().clearCookies();
    await signInViaUi(page, email, "a first password 88");
  });

  test("delete account removes the member, the scans and the stored photos", async ({
    browser,
    baseURL,
  }) => {
    const member = await newMember(browser, baseURL ?? "", "delete");
    const { page, email } = member;
    try {
      await page.goto("/scan");
      await page.getByTestId("photo-input").setInputFiles(photo("grape.jpg"));
      await page.getByRole("button", { name: "Analyze leaf" }).click();
      await expect(page.getByTestId("result-view")).toBeVisible({ timeout: 45_000 });

      const userId = await currentUserId(page);
      expect(await scanObjectKeys(page.request, userId)).toHaveLength(1);

      const panel = await openPanel(page, "danger");
      await openDeleteDialog(page, panel, "wrong password here");
      await page.getByRole("dialog").getByRole("button", { name: "Delete account" }).click();
      await expect(
        panel.getByText("That password is not correct. Check it and try again."),
      ).toBeVisible();
      expect(await scanObjectKeys(page.request, userId)).toHaveLength(1);

      await openDeleteDialog(page, panel, PASSWORD);
      await page.getByRole("dialog").getByRole("button", { name: "Delete account" }).click();
      await expect(
        page.getByTestId("goodbye").getByRole("heading", { name: "Your account is deleted" }),
      ).toBeVisible();

      // The API drains the deletion queue itself; run the job too so the check never races it.
      runPurgeJob();
      await expect
        .poll(async () => (await scanObjectKeys(page.request, userId)).length, { timeout: 30_000 })
        .toBe(0);

      // The account is gone: protected pages ask to sign in and the credentials no longer work.
      await page.goto("/dashboard");
      await expect(page).toHaveURL(/\/login/);
      await page.getByLabel("Email").fill(email);
      await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
      await page.getByRole("button", { name: "Sign in" }).click();
      await expect(page.locator("form").getByRole("alert")).toContainText(/do not match/);
    } finally {
      await member.close();
    }
  });
});
