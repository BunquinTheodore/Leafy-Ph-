import { expect, test, type Page } from "@playwright/test";
import { googleAge, mockCalls, resetMock, uniqueEmail } from "./support/helpers";

const PASSWORD = "a long passphrase here";

test.beforeEach(async ({ request }) => {
  await resetMock(request);
});

test.describe("register", () => {
  test("creates an account, signs in and continues to next", async ({ page, context, request }) => {
    const email = uniqueEmail("ada");
    await page.goto("/register?next=%2Fscan");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Create account");
    await page.getByLabel("Your name").fill("Ada Lovelace");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
    await expect(page.getByRole("meter", { name: "Password strength" })).toBeVisible();
    await page.getByRole("button", { name: "Create account" }).click();
    await page.waitForURL("**/scan");

    const names = (await context.cookies()).map((cookie) => cookie.name);
    expect(names).toEqual(expect.arrayContaining(["leafy_at", "leafy_rt"]));
    const call = (await mockCalls(request)).find((c) => c.key === "POST /api/v1/auth/register");
    expect(call?.body).toMatchObject({ email, first_name: "Ada", last_name: "Lovelace" });
  });

  test("an email that is already used explains itself and offers sign in", async ({ page }) => {
    await page.goto("/register");
    await page.getByLabel("Your name").fill("Ada Lovelace");
    await page.getByLabel("Email").fill("taken@example.com");
    await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByText("That email already has an account.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Reset password" })).toHaveCount(0);
    // What was typed is still there.
    await expect(page.getByLabel("Your name")).toHaveValue("Ada Lovelace");
    await expect(page.getByLabel("Password", { exact: true })).toHaveValue(PASSWORD);
  });

  test("inline validation focuses the first problem and does not call the API", async ({
    page,
    request,
  }) => {
    await page.goto("/register");
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByText("Tell us what to call you.")).toBeVisible();
    await expect(page.getByLabel("Your name")).toBeFocused();
    expect(await mockCalls(request)).toHaveLength(0);
  });

  test("a password the API rejects is explained on the password field", async ({ page }) => {
    await page.goto("/register");
    await page.getByLabel("Your name").fill("Ada");
    await page.getByLabel("Email").fill(uniqueEmail("weak"));
    await page.getByLabel("Password", { exact: true }).fill("password123456");
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByText(/password was not accepted/)).toBeVisible();
    await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute(
      "aria-invalid",
      "true",
    );
  });

  test("a rate limit shows a countdown, then lets the visitor try again", async ({ page }) => {
    await page.goto("/register");
    await page.getByLabel("Your name").fill("Ada");
    await page.getByLabel("Email").fill("limited@example.com");
    await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
    const submit = page.getByRole("button", { name: "Create account" });
    await submit.click();
    await expect(page.getByText(/Try again in/)).toBeVisible();
    await expect(submit).toBeDisabled();
    await expect(submit).toBeEnabled({ timeout: 8000 });
    await expect(page.getByText(/Try again in/)).toBeHidden();
  });

  test("terms and privacy links open in a new tab so the form is kept", async ({
    page,
    context,
  }) => {
    await page.goto("/register");
    await page.getByLabel("Your name").fill("Ada");
    const [popup] = await Promise.all([
      context.waitForEvent("page"),
      page.locator("form").getByRole("link", { name: "Terms" }).click(),
    ]);
    await popup.waitForLoadState();
    expect(new URL(popup.url()).pathname).toBe("/terms");
    await expect(page.getByLabel("Your name")).toHaveValue("Ada");
  });
});

test.describe("login", () => {
  async function seedAccount(page: import("@playwright/test").Page, email: string) {
    await page.goto("/register");
    await page.getByLabel("Your name").fill("Ada Lovelace");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
    await page.getByRole("button", { name: "Create account" }).click();
    await page.waitForURL("**/dashboard");
    await page.context().clearCookies();
  }

  test("signs in and returns to next", async ({ page }) => {
    const email = uniqueEmail("login");
    await seedAccount(page, email);
    await page.goto("/login?next=%2Fscan");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL("**/scan");
  });

  test("ignores an unsafe next and goes to the dashboard", async ({ page }) => {
    const email = uniqueEmail("safe");
    await seedAccount(page, email);
    await page.goto("/login?next=%2F%2Fevil.example");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL("**/dashboard");
    expect(new URL(page.url()).hostname).toBe("localhost");
  });

  test("wrong credentials give one uniform message and keep the typed email", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill("nobody@example.com");
    await page.getByLabel("Password", { exact: true }).fill("not-the-password");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.locator("form").getByRole("alert")).toContainText(/do not match/);
    await expect(page.getByLabel("Email")).toHaveValue("nobody@example.com");
    await expect(page.getByLabel("Password", { exact: true })).toHaveValue("not-the-password");
  });

  test("a rate limit shows a countdown", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill("limited@example.com");
    await page.getByLabel("Password", { exact: true }).fill("whatever");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByText(/Try again in/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign in" })).toBeDisabled();
  });

  test.describe("notes", () => {
    const cases: Array<[string, RegExp]> = [
      ["/login?reason=session_expired&next=%2Fscan", /session ended/],
      ["/login?reason=session_revoked", /signed you out/],
      ["/login?error=google_cancelled", /cancelled/],
      ["/login?error=google_auth_failed", /Google sign in did not work/],
      ["/login?error=google_email_unverified", /not verified/],
    ];
    for (const [url, text] of cases) {
      test(`${url} shows a calm note`, async ({ page }) => {
        await page.goto(url);
        await expect(page.getByText(text)).toBeVisible();
      });
    }

    test("session_expired keeps next on the links", async ({ page }) => {
      await page.goto("/login?reason=session_expired&next=%2Fscan");
      await expect(page.getByRole("link", { name: "Create an account" })).toHaveAttribute(
        "href",
        "/register?next=%2Fscan",
      );
    });

    test("unknown values are never echoed", async ({ page }) => {
      await page.goto("/login?error=%3Cimg%20src%3Dx%3E");
      await expect(page.locator("img[src=x]")).toHaveCount(0);
    });
  });

  test("keyboard: tab order is Google, email, password, reveal, submit and Enter submits", async ({
    page,
  }) => {
    await page.goto("/login");
    await page.keyboard.press("Tab"); // skip link
    await page.keyboard.press("Tab");
    // Header links come first; move until the Google link has focus.
    for (let i = 0; i < 12; i += 1) {
      const name = await page.evaluate(() => document.activeElement?.textContent?.trim() ?? "");
      if (name.includes("Continue with Google")) break;
      await page.keyboard.press("Tab");
    }
    await expect(page.getByRole("button", { name: "Continue with Google" })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(page.getByLabel("Email")).toBeFocused();
    await page.keyboard.type("nobody@example.com");
    await page.keyboard.press("Tab");
    await expect(page.getByLabel("Password", { exact: true })).toBeFocused();
    await page.keyboard.type("secret");
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "Show password" })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute("type", "text");
    await page.getByLabel("Password", { exact: true }).focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("form").getByRole("alert")).toContainText(/do not match/);
  });

  test("signed in visitors are sent away from the login page", async ({ page }) => {
    const email = uniqueEmail("again");
    await seedAccount(page, email);
    await page.goto("/login");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL("**/dashboard");
    await page.goto("/login");
    await page.waitForURL("**/dashboard");
  });
});

test.describe("google sign in", () => {
  test("Continue with Google signs in through the mock provider and honours next", async ({
    page,
    context,
    request,
  }) => {
    const email = uniqueEmail("gnew");
    await page.goto(`/login?next=%2Fscan&mock_google_email=${encodeURIComponent(email)}`);
    await page.getByRole("button", { name: "Continue with Google" }).click();
    await page.waitForURL("**/scan");
    const names = (await context.cookies()).map((cookie) => cookie.name);
    expect(names).toEqual(expect.arrayContaining(["leafy_at", "leafy_rt"]));
    const call = (await mockCalls(request)).find((c) => c.key === "POST /api/v1/auth/google");
    expect(call?.body).toHaveProperty("id_token");
    expect(JSON.stringify(call?.body)).not.toContain("idToken");
  });

  test("the register page has the same button and signs in", async ({ page }) => {
    await page.goto("/register");
    await page.getByRole("button", { name: "Continue with Google" }).click();
    await page.waitForURL("**/dashboard");
  });

  test("the session cookies stay httpOnly and the token never reaches the page", async ({
    page,
    context,
  }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: "Continue with Google" }).click();
    await page.waitForURL("**/dashboard");
    const cookies = await context.cookies();
    for (const name of ["leafy_at", "leafy_rt"])
      expect(cookies.find((c) => c.name === name)?.httpOnly).toBe(true);
    expect(await page.evaluate(() => document.cookie)).not.toContain("leafy_at");
  });

  test("an email Google has not verified is refused with a calm note", async ({
    page,
    context,
  }) => {
    await page.goto("/login?mock_google_email=unverified%40example.com");
    await page.getByRole("button", { name: "Continue with Google" }).click();
    await expect(page.locator("form").getByRole("alert")).toContainText(
      /has not verified that email/,
    );
    expect(await context.cookies()).toEqual([]);
    await expect(page.getByRole("button", { name: "Continue with Google" })).toBeEnabled();
  });

  test("a failed sign in explains itself and can be retried", async ({ page }) => {
    await page.goto("/login?mock_google_email=broken%40example.com");
    await page.getByRole("button", { name: "Continue with Google" }).click();
    await expect(page.locator("form").getByRole("alert")).toContainText(
      /Google sign in did not work/,
    );
  });

  test("a network error to our server is reported and nothing is stored", async ({
    page,
    context,
  }) => {
    await page.route("**/api/auth/google", (route) => route.abort());
    await page.goto("/login");
    await page.getByRole("button", { name: "Continue with Google" }).click();
    await expect(page.locator("form").getByRole("alert")).toContainText(/could not reach Leafy/);
    expect(await context.cookies()).toEqual([]);
  });

  test("the old redirect routes are gone", async ({ request }) => {
    expect((await request.get("/api/auth/google")).status()).toBe(405);
    expect((await request.get("/api/auth/google/callback?code=x&state=y")).status()).toBe(404);
  });

  test("a cross site POST to the route is refused", async ({ request }) => {
    const res = await request.post("/api/auth/google", {
      headers: { origin: "https://evil.example", "content-type": "application/json" },
      data: { idToken: "x".repeat(40) },
    });
    expect(res.status()).toBe(403);
  });
});

test.describe("password recovery without email", () => {
  const NEW_PASSWORD = "another long passphrase";

  async function registerThenSignOut(page: Page, email: string) {
    await page.goto("/register");
    await page.getByLabel("Your name").fill("Ada Lovelace");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
    await page.getByRole("button", { name: "Create account" }).click();
    await page.waitForURL("**/dashboard");
    await page.context().clearCookies();
  }

  /** Waits for hydration, so typed values are not reset by a late client render. */
  async function openPasswordPanel(page: Page) {
    await page.goto("/account#password");
    await page.waitForLoadState("networkidle");
  }

  async function signInWithGoogle(page: Page, email: string) {
    await page.goto(`/login?next=%2Faccount&mock_google_email=${encodeURIComponent(email)}`);
    await page.getByRole("button", { name: "Continue with Google" }).click();
    await page.waitForURL("**/account");
  }

  test("the login page explains the way back in, with no reset link or email form", async ({
    page,
    request,
  }) => {
    await page.goto("/login");
    await expect(page.getByTestId("forgot-help")).toHaveText(
      "Forgot your password? Sign in with Google, then set a new one in Account.",
    );
    await expect(page.getByRole("link", { name: /forgot/i })).toHaveCount(0);
    expect((await request.get("/forgot-password")).status()).toBe(404);
  });

  test("a fresh Google sign in sets a new password without the current one", async ({
    page,
    request,
  }) => {
    const email = uniqueEmail("recover");
    await registerThenSignOut(page, email);
    await signInWithGoogle(page, email);

    await openPasswordPanel(page);
    await expect(page.getByLabel("Current password")).toHaveCount(0);
    await expect(page.getByText(/You signed in with Google a moment ago/)).toBeVisible();
    await page.getByLabel("New password", { exact: true }).fill(NEW_PASSWORD);
    await page.getByRole("button", { name: "Change password" }).click();
    await expect(page.getByText("Password changed.")).toBeVisible();

    const call = (await mockCalls(request)).find((c) => c.key === "POST /api/v1/users/me/password");
    expect(call?.body).toEqual({ new_password: NEW_PASSWORD });

    await page.context().clearCookies();
    await page.goto("/login");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password", { exact: true }).fill(NEW_PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL("**/dashboard");
  });

  test("a stale Google session still has to give the current password", async ({
    page,
    request,
  }) => {
    const email = uniqueEmail("stale");
    await registerThenSignOut(page, email);
    await googleAge(request, 11 * 60);
    await signInWithGoogle(page, email);

    await openPasswordPanel(page);
    await expect(page.getByLabel("Current password")).toBeVisible();
    await page.getByLabel("Current password").fill("not the password");
    await page.getByLabel("New password", { exact: true }).fill(NEW_PASSWORD);
    await page.getByRole("button", { name: "Change password" }).click();
    await expect(
      page.getByText("That password is not correct. Check it and try again."),
    ).toBeVisible();
  });

  test("a password only session needs the current password", async ({ page, request }) => {
    const email = uniqueEmail("pwonly");
    await page.goto("/register");
    await page.getByLabel("Your name").fill("Ada Lovelace");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
    await page.getByRole("button", { name: "Create account" }).click();
    await page.waitForURL("**/dashboard");

    await openPasswordPanel(page);
    await expect(page.getByLabel("Current password")).toBeVisible();
    await page.getByLabel("New password", { exact: true }).fill(NEW_PASSWORD);
    await page.getByRole("button", { name: "Change password" }).click();
    await expect(page.getByText("Enter your current password.")).toBeVisible();
    expect((await mockCalls(request)).some((c) => c.key === "POST /api/v1/users/me/password")).toBe(
      false,
    );

    await page.getByLabel("Current password").fill(PASSWORD);
    await page.getByRole("button", { name: "Change password" }).click();
    await expect(page.getByText("Password changed.")).toBeVisible();
  });
});

test("auth pages raise no Content Security Policy or page errors", async ({ page }) => {
  const problems: string[] = [];
  page.on("pageerror", (error) => problems.push(error.message));
  // Link prefetches (?_rsc=) to pages owned by other areas can 404 while those pages are built.
  page.on("console", (message) => {
    const text = message.text();
    if (message.type() === "error" && !text.startsWith("Failed to load resource"))
      problems.push(text);
  });
  page.on("response", (response) => {
    if (response.status() >= 400 && !response.url().includes("_rsc="))
      problems.push(`${response.status()} ${response.url()}`);
  });
  for (const path of ["/login", "/register"]) {
    await page.goto(`${path}?nosplash`);
    await page.waitForTimeout(1800); // let the leaves load after idle
  }
  expect(problems).toEqual([]);
});
