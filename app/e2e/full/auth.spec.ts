import { expect, googleSignInViaUi, PASSWORD, registerViaUi, test, uniqueEmail } from "./support";

test.describe("sign in and out", () => {
  test("login, protected pages, logout, and a wrong password", async ({ page, context }) => {
    const email = uniqueEmail("login");
    await registerViaUi(page, { email });
    await page.getByRole("button", { name: "Open account menu" }).click();
    await page.getByRole("button", { name: "Sign out" }).click();
    await page.waitForURL(/\/$/);
    expect((await context.cookies()).map((cookie) => cookie.name)).not.toContain("leafy_at");

    // Signed out, a protected page sends the visitor to sign in and keeps the place.
    await page.goto("/scans");
    await expect(page).toHaveURL(/\/login\?.*next=%2Fscans/);

    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password", { exact: true }).fill("not the right password");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.locator("form").getByRole("alert")).toContainText(/do not match/);

    await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL("**/scans");
    await expect(page.getByRole("heading", { level: 1, name: "Your scans" })).toBeVisible();
    expect((await context.cookies()).map((cookie) => cookie.name)).toContain("leafy_at");
  });

  test("an email that is already registered is explained", async ({ page }) => {
    const email = uniqueEmail("taken");
    await registerViaUi(page, { email });
    await page.context().clearCookies();
    await page.goto("/register");
    await page.getByLabel("Your name").fill("Ada Lovelace");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByText("That email already has an account.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Reset password" })).toHaveCount(0);
  });
});

test.describe("password recovery without email", () => {
  const NEW_PASSWORD = "a fresh passphrase 2026";

  // Leafy sends no email, so no password account is ever verified. A Google sign in with the same
  // address proves ownership: the API drops the earlier, unproven password and its sessions, and
  // the member sets a new one without any old password.
  test("a fresh Google sign in sets a new password without the old one", async ({
    page,
    context,
  }) => {
    const email = uniqueEmail("recover");
    await registerViaUi(page, { email });
    await context.clearCookies();

    await googleSignInViaUi(page, email, "/account");
    await page.waitForURL("**/account");
    await page.goto("/account#password");
    await expect(page.getByLabel("Current password")).toHaveCount(0);
    await page.getByLabel("New password", { exact: true }).fill(NEW_PASSWORD);
    await page.getByRole("button", { name: "Set password" }).click();
    await expect(page.getByText("Password set.")).toBeVisible();

    await context.clearCookies();
    await page.goto("/login");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.locator("form").getByRole("alert")).toContainText(/do not match/);
    await page.getByLabel("Password", { exact: true }).fill(NEW_PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL("**/dashboard");
  });

  test("a password session cannot skip the current password", async ({ page, baseURL }) => {
    await registerViaUi(page, { email: uniqueEmail("pwonly") });
    const reply = await page.request.post("/api/me/password", {
      headers: { origin: baseURL ?? "" },
      data: { new_password: NEW_PASSWORD },
    });
    expect(reply.status()).toBe(422);
  });

  test("the login page explains the way back in and there is no reset page", async ({
    page,
    request,
  }) => {
    await page.goto("/login");
    await expect(page.getByTestId("forgot-help")).toContainText("Sign in with Google");
    expect((await request.get("/forgot-password")).status()).toBe(404);
  });
});
