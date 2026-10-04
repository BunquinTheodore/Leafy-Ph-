import {
  expect,
  linkFrom,
  PASSWORD,
  registerViaUi,
  signInViaUi,
  test,
  uniqueEmail,
  verifyViaMail,
  waitForMail,
} from "./support";

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
    await expect(page.getByRole("link", { name: "Reset password" })).toBeVisible();
  });
});

test.describe("verify email", () => {
  test("a used or invalid link shows the expired state, and resend sends a new mail", async ({
    page,
    request,
  }) => {
    const email = uniqueEmail("verify");
    await registerViaUi(page, { email });
    const first = await waitForMail(request, email, "Verify your Leafy email");
    const link = linkFrom(first.text, "/verify-email");
    await page.goto(link);
    await expect(page.getByRole("heading", { name: "Email verified" })).toBeVisible();

    await page.goto("/verify-email?token=not-a-real-token-0123456789abcdefghijklmnop");
    await expect(page.getByRole("heading", { name: "This link has expired" })).toBeVisible();
  });

  test("the banner resend delivers a second mail", async ({ page, request }) => {
    const email = uniqueEmail("resend");
    await registerViaUi(page, { email });
    await waitForMail(request, email, "Verify your Leafy email");
    // The stack runs with a 1 second resend cooldown (60 seconds by default).
    await page.waitForTimeout(1500);
    await page.getByRole("button", { name: "Resend email" }).first().click();
    await waitForMail(request, email, "Verify your Leafy email", 2);
  });
});

test.describe("forgot and reset password", () => {
  test("the mailed link sets a new password, signs other sessions out and old password fails", async ({
    page,
    request,
    browser,
    baseURL,
  }) => {
    const email = uniqueEmail("reset");
    await registerViaUi(page, { email });
    await verifyViaMail(page, request, email);

    // A second device signed in with the old password.
    const other = await browser.newContext({ baseURL });
    const otherPage = await other.newPage();
    await signInViaUi(otherPage, email);

    await page.context().clearCookies();
    await page.goto("/forgot-password");
    await page.getByLabel("Email").fill(email);
    await page.getByRole("button", { name: "Send reset link" }).click();
    await expect(page.getByRole("heading", { name: "Check your inbox" })).toBeVisible();

    const mail = await waitForMail(request, email, "Reset your Leafy password");
    await page.goto(linkFrom(mail.text, "/reset-password"));
    await expect(page.getByRole("heading", { level: 1, name: "New password" })).toBeVisible();
    await page.waitForFunction(() => !location.search.includes("token="));
    const newPassword = "a fresh passphrase 2026";
    await page.getByLabel("New password", { exact: true }).fill(newPassword);
    await page.getByRole("button", { name: "Update password" }).click();
    await expect(page.getByRole("heading", { name: "Password updated" })).toBeVisible();

    // The link works once.
    await page.goto(linkFrom(mail.text, "/reset-password"));
    await page.getByLabel("New password", { exact: true }).fill("yet another passphrase 77");
    await page.getByRole("button", { name: "Update password" }).click();
    await expect(page.getByRole("heading", { name: "This link has expired" })).toBeVisible();

    // Old password no longer works, the new one does.
    await page.goto("/login");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.locator("form").getByRole("alert")).toContainText(/do not match/);
    await page.getByLabel("Password", { exact: true }).fill(newPassword);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL("**/dashboard");

    // The other device lost its refresh token: once its short lived access cookie is gone it is
    // asked to sign in again instead of being renewed.
    await other.clearCookies({ name: "leafy_at" });
    await otherPage.goto("/account");
    await expect(otherPage).toHaveURL(/\/login/);
    await other.close();
  });

  test("an unknown email gets the same calm answer and no mail", async ({ page, request }) => {
    const email = uniqueEmail("nobody");
    await page.goto("/forgot-password");
    await page.getByLabel("Email").fill(email);
    await page.getByRole("button", { name: "Send reset link" }).click();
    await expect(page.getByRole("heading", { name: "Check your inbox" })).toBeVisible();
    await page.waitForTimeout(1500);
    const reply = await request.get(
      `http://127.0.0.1:8025/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`,
    );
    expect(((await reply.json()) as { messages_count: number }).messages_count).toBe(0);
  });
});
