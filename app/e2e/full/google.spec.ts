import { expect, PASSWORD, registerViaUi, test, uniqueEmail, verifyViaMail } from "./support";

/** The API's mock Google provider stands in for Google (GOOGLE_MOCK=1); `email` picks the identity. */
const googleUrl = (email: string, next?: string): string =>
  `/api/auth/google?email=${encodeURIComponent(email)}${next ? `&next=${encodeURIComponent(next)}` : ""}`;

test.describe("Google sign in through the mock provider", () => {
  test("a new Google user gets an account and lands on the dashboard", async ({
    page,
    context,
  }) => {
    const email = uniqueEmail("google.new");
    await page.goto(googleUrl(email));
    await page.waitForURL("**/dashboard");
    expect((await context.cookies()).map((cookie) => cookie.name)).toContain("leafy_at");
    // First time: a short welcome, shown once.
    await expect(page.getByRole("status").filter({ hasText: "Welcome to Leafy" })).toBeVisible();
    // Google has verified the address, so there is no verify banner.
    await expect(page.getByText("Check your email to verify your account.")).toHaveCount(0);

    await page.goto("/account#profile");
    const profile = page.getByRole("group", { name: /: Profile$/ });
    await expect(profile.getByText("Google", { exact: true })).toBeVisible();
    await expect(profile.getByLabel("Email")).toHaveValue(email);
    await expect(profile.getByText("Email and password")).toHaveCount(0);
  });

  test("a Google sign in with an email that already has a password account links to it", async ({
    page,
    request,
    context,
  }) => {
    const email = uniqueEmail("google.link");
    await registerViaUi(page, { email, first: "Grace", last: "Hopper" });
    await verifyViaMail(page, request, email);
    await page.getByRole("button", { name: "Open account menu" }).click();
    await page.getByRole("button", { name: "Sign out" }).click();
    await page.waitForURL(/\/$/);

    await page.goto(googleUrl(email, "/account"));
    await page.waitForURL("**/account");
    await expect(page.getByRole("button", { name: "Open account menu" })).toHaveText("GH");
    await expect(
      page.getByRole("status").filter({ hasText: "linked it to your existing Leafy account" }),
    ).toBeVisible();
    await page.goto("/account#profile");
    const profile = page.getByRole("group", { name: /: Profile$/ });
    await expect(profile.getByText("Email and password")).toBeVisible();
    await expect(profile.getByText("Google", { exact: true })).toBeVisible();

    // The password still works after linking.
    await context.clearCookies();
    await page.goto("/login");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL("**/dashboard");
  });

  test("the Continue with Google button on the sign in page signs in", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("link", { name: "Continue with Google" }).click();
    await page.waitForURL("**/dashboard");
  });

  test("a callback without the stored state is refused with a plain message", async ({ page }) => {
    await page.goto("/api/auth/google/callback?code=nope&state=nope");
    await expect(page).toHaveURL(/\/login\?error=invalid_state/);
    await expect(page.getByText(/no longer valid/)).toBeVisible();
  });
});
