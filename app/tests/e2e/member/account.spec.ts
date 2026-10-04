import { expect, test, type Page } from "@playwright/test";
import {
  callsTo,
  mockState,
  resetMock,
  sessionCookieNames,
  signIn,
  waitForHydration,
} from "./helpers";

async function openPanel(page: Page, id: "profile" | "password" | "danger") {
  await page.goto(`/account#${id}`);
  await waitForHydration(page);
  const label = { profile: "Profile", password: "Password", danger: "Danger zone" }[id];
  const panel = page.getByRole("group", { name: new RegExp(`: ${label}$`) });
  await expect(panel).toHaveAttribute("data-active", "true");
  return panel;
}

test.beforeEach(async ({ context }) => {
  await resetMock();
  await signIn(context);
});

test.describe("account panels", () => {
  test("shows how the member signs in and edits the profile", async ({ page }) => {
    const panel = await openPanel(page, "profile");
    await expect(panel.getByText("Email and password")).toBeVisible();
    await expect(panel.getByLabel("Email")).toHaveValue("ada@example.com");
    await expect(panel.getByRole("button", { name: "Save changes" })).toBeDisabled();

    await panel.getByLabel("First name").fill("Grace");
    await panel.getByLabel("Last name").fill("Hopper");
    await panel.getByRole("button", { name: "Save changes" }).click();

    await expect(page.getByRole("status").filter({ hasText: "Profile saved." })).toBeVisible();
    const patches = await callsTo("PATCH", "/users/me");
    expect(patches).toHaveLength(1);
    expect(patches[0]?.body).toEqual({ first_name: "Grace", last_name: "Hopper" });

    // The header menu shows the new initials after the page refreshes.
    await expect(page.getByRole("button", { name: "Open account menu" })).toHaveText("GH");
  });

  test("will not save an empty first name", async ({ page }) => {
    const panel = await openPanel(page, "profile");
    await panel.getByLabel("First name").fill("");
    await panel.getByRole("button", { name: "Save changes" }).click();
    await expect(panel.getByText("Enter your first name.")).toBeVisible();
    expect(await callsTo("PATCH", "/users/me")).toHaveLength(0);
  });

  test("changes the password with the current one", async ({ page }) => {
    const panel = await openPanel(page, "password");

    await panel.getByLabel("Current password").fill("not-the-password");
    await panel.getByLabel("New password").fill("a brand new phrase 77");
    await panel.getByRole("button", { name: "Change password" }).click();
    await expect(
      panel.getByText("That password is not correct. Check it and try again."),
    ).toBeVisible();

    await panel.getByLabel("Current password").fill("correct-horse-1");
    await panel.getByRole("button", { name: "Change password" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Password changed." })).toBeVisible();

    const posts = await callsTo("POST", "/users/me/password");
    expect(posts.at(-1)?.body).toEqual({
      current_password: "correct-horse-1",
      new_password: "a brand new phrase 77",
    });
    expect((await mockState()).password).toBe("a brand new phrase 77");
    await expect(panel.getByLabel("New password")).toHaveValue("");
  });

  test("lets a Google only member set a first password", async ({ page }) => {
    await resetMock({ hasPassword: false, user: { auth_methods: ["google"] } });
    const panel = await openPanel(page, "password");
    await expect(panel.getByRole("heading", { name: "Set a password" })).toBeVisible();
    await expect(panel.getByLabel("Current password")).toHaveCount(0);

    await panel.getByLabel("New password").fill("a first password 88");
    await panel.getByRole("button", { name: "Set password" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Password set." })).toBeVisible();

    const posts = await callsTo("POST", "/users/me/password");
    expect(posts[0]?.body).toEqual({ new_password: "a first password 88" });
    // After the refresh the panel becomes a normal change password form.
    await expect(panel.getByRole("heading", { name: "Password" })).toBeVisible();
    await expect(panel.getByLabel("Current password")).toBeVisible();
  });

  test("deletes the account after a password and a final confirmation", async ({
    page,
    context,
  }) => {
    const panel = await openPanel(page, "danger");
    await expect(panel.getByText("Every scan and the photo you uploaded.")).toBeVisible();

    await panel.getByRole("button", { name: "Delete my account" }).click();
    await expect(panel.getByText("Enter your password.")).toBeVisible();
    expect(await callsTo("DELETE", "/users/me")).toHaveLength(0);

    await panel.getByLabel("Password", { exact: true }).fill("wrong-password");
    await panel.getByLabel("Type DELETE to confirm").fill("DELETE");
    await panel.getByRole("button", { name: "Delete my account" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Delete account" }).click();
    await expect(
      panel.getByText("That password is not correct. Check it and try again."),
    ).toBeVisible();
    expect((await mockState()).deleted).toBe(false);

    await panel.getByLabel("Password", { exact: true }).fill("correct-horse-1");
    await panel.getByRole("button", { name: "Delete my account" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Delete account" }).click();

    const goodbye = page.getByTestId("goodbye");
    await expect(goodbye.getByRole("heading", { name: "Your account is deleted" })).toBeFocused();
    expect((await mockState()).deleted).toBe(true);
    expect(await sessionCookieNames(context)).toEqual([]);

    await goodbye.getByRole("link", { name: "Back to the home page" }).click();
    await expect(page).toHaveURL(/\/$/);
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });

  test("asks a Google only member to sign in again when the session is old", async ({ page }) => {
    await resetMock({
      hasPassword: false,
      reauthRequired: true,
      user: { auth_methods: ["google"] },
    });
    const panel = await openPanel(page, "danger");
    await expect(panel.getByLabel("Password", { exact: true })).toHaveCount(0);
    await expect(panel.getByText(/no password to enter/i)).toBeVisible();

    await panel.getByLabel("Type DELETE to confirm").fill("DELETE");
    await panel.getByRole("button", { name: "Delete my account" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Delete account" }).click();

    const link = panel.getByRole("link", { name: "Sign in with Google again" });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute("href", "/api/auth/google?next=%2Faccount%23danger");
    expect((await mockState()).deleted).toBe(false);
    expect((await callsTo("DELETE", "/users/me")).at(-1)?.body).toEqual({ confirmation: "DELETE" });
  });

  test("moves between panels with the keyboard and the dots", async ({ page }) => {
    await page.goto("/account");
    await expect(page.getByRole("heading", { level: 1, name: "Account" })).toBeVisible();
    await page.getByRole("button", { name: "Go to Password" }).click();
    await expect(page).toHaveURL(/#password$/);
    await page.getByRole("button", { name: "Go to Danger zone" }).focus();
    await page.keyboard.press("ArrowLeft");
    await expect(page).toHaveURL(/#profile$|#password$/);
    await page.getByRole("button", { name: "Next panel" }).click();
    await expect(page.getByRole("group", { name: /: Password$/ })).toHaveAttribute(
      "data-active",
      "true",
    );
  });
});
