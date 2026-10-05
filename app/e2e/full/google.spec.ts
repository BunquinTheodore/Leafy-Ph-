import { expect, googleSignInViaUi, PASSWORD, registerViaUi, test, uniqueEmail } from "./support";

/** The mock sign in stands in for Google (NEXT_PUBLIC_AUTH_MOCK=1 web, GOOGLE_MOCK=1 API). */

test.describe("Google sign in through the mock provider", () => {
  test("a new Google user gets an account and lands on the dashboard", async ({
    page,
    context,
  }) => {
    const email = uniqueEmail("google.new");
    await googleSignInViaUi(page, email);
    await page.waitForURL("**/dashboard");
    expect((await context.cookies()).map((cookie) => cookie.name)).toContain("leafy_at");
    // First time: a short welcome, shown once.
    await expect(page.getByRole("status").filter({ hasText: "Welcome to Leafy" })).toBeVisible();

    await page.goto("/account#profile");
    const profile = page.getByRole("group", { name: /: Profile$/ });
    await expect(profile.getByText("Google", { exact: true })).toBeVisible();
    await expect(profile.getByLabel("Email")).toHaveValue(email);
    await expect(profile.getByText("Email and password")).toHaveCount(0);
  });

  test("a Google sign in with an email that already has a password account links to it and drops the unproven password", async ({
    page,
    context,
  }) => {
    const email = uniqueEmail("google.link");
    await registerViaUi(page, { email, first: "Grace", last: "Hopper" });
    await page.getByRole("button", { name: "Open account menu" }).click();
    await page.getByRole("button", { name: "Sign out" }).click();
    await page.waitForURL(/\/$/);

    await googleSignInViaUi(page, email, "/account");
    await page.waitForURL("**/account");
    await expect(page.getByRole("button", { name: "Open account menu" })).toHaveText("GH");
    await expect(
      page.getByRole("status").filter({ hasText: "linked it to your existing Leafy account" }),
    ).toBeVisible();
    await page.goto("/account#profile");
    const profile = page.getByRole("group", { name: /: Profile$/ });
    await expect(profile.getByText("Google", { exact: true })).toBeVisible();
    // No email is ever verified, so the earlier password is unproven and is removed on linking.
    await expect(profile.getByText("Email and password")).toHaveCount(0);

    await context.clearCookies();
    await page.goto("/login");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.locator("form").getByRole("alert")).toContainText(/do not match/);
  });

  test("the Continue with Google button on the sign in page signs in", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: "Continue with Google" }).click();
    await page.waitForURL("**/dashboard");
  });
});
