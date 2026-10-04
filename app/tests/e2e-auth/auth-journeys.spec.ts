import { expect, test } from "@playwright/test";
import { mintToken, mockCalls, resetMock, uniqueEmail } from "./support/helpers";

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

  test("an email that is already used explains itself and offers sign in and reset", async ({
    page,
  }) => {
    await page.goto("/register");
    await page.getByLabel("Your name").fill("Ada Lovelace");
    await page.getByLabel("Email").fill("taken@example.com");
    await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByText("That email already has an account.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Reset password" })).toHaveAttribute(
      "href",
      "/forgot-password",
    );
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
    await expect(page.getByRole("link", { name: "Continue with Google" })).toBeFocused();
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
  test("Continue with Google signs in through the mock provider", async ({ page, context }) => {
    await page.goto("/login?next=%2Fscan");
    await page.getByRole("link", { name: "Continue with Google" }).click();
    await page.waitForURL("**/scan");
    const names = (await context.cookies()).map((cookie) => cookie.name);
    expect(names).toEqual(expect.arrayContaining(["leafy_at", "leafy_rt"]));
    expect(names).not.toContain("leafy_oauth");
  });

  test("the register page has the same Google button", async ({ page }) => {
    await page.goto("/register");
    await expect(page.getByRole("link", { name: "Continue with Google" })).toHaveAttribute(
      "href",
      "/api/auth/google",
    );
  });
});

test.describe("forgot and reset password", () => {
  test("forgot password always gives the same calm confirmation", async ({ page }) => {
    await page.goto("/forgot-password");
    await page.getByLabel("Email").fill("nobody@example.com");
    await page.getByRole("button", { name: "Send reset link" }).click();
    await expect(page.getByText(/If an account exists for that email/)).toBeVisible();
    await expect(page.getByRole("button", { name: /You can send another link in/ })).toBeDisabled();
    await expect(page.getByRole("link", { name: "Back to sign in" })).toBeVisible();
  });

  test("a valid link sets the password, hides the token and works once", async ({
    page,
    request,
  }) => {
    const token = await mintToken(request, "reset");
    const response = await page.goto(`/reset-password?token=${token}`);
    expect(response?.headers()["referrer-policy"]).toBe("no-referrer");
    await expect(page.locator('meta[name="referrer"]')).toHaveAttribute("content", "no-referrer");
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("New password");
    await page.waitForFunction(() => !location.search.includes("token="));

    await page.getByLabel("New password", { exact: true }).fill("another long passphrase");
    await page.getByRole("button", { name: "Update password" }).click();
    await expect(page.getByText("Password updated")).toBeVisible();
    await expect(
      page.locator(".auth-state").getByRole("link", { name: "Sign in" }),
    ).toHaveAttribute("href", "/login");

    await page.goto(`/reset-password?token=${token}`);
    await page.getByLabel("New password", { exact: true }).fill("another long passphrase");
    await page.getByRole("button", { name: "Update password" }).click();
    await expect(page.getByText("This link has expired")).toBeVisible();
    await expect(page.getByRole("link", { name: "Send a new link" })).toHaveAttribute(
      "href",
      "/forgot-password",
    );
  });

  test("a missing or unknown token shows the expired state", async ({ page }) => {
    await page.goto("/reset-password");
    await expect(page.getByText("This link has expired")).toBeVisible();
    await page.goto("/reset-password?token=nope");
    await page.getByLabel("New password", { exact: true }).fill("another long passphrase");
    await page.getByRole("button", { name: "Update password" }).click();
    await expect(page.getByText("This link has expired")).toBeVisible();
  });
});

test.describe("verify email", () => {
  test("verifies on load with a single POST and offers a way on", async ({ page, request }) => {
    const token = await mintToken(request, "verify");
    const response = await page.goto(`/verify-email?token=${token}`);
    expect(response?.headers()["referrer-policy"]).toBe("no-referrer");
    await expect(page.getByText("Email verified")).toBeVisible();
    await expect(page.getByRole("link", { name: "Continue to Leafy" })).toHaveAttribute(
      "href",
      "/dashboard",
    );
    const verifyCalls = (await mockCalls(request)).filter(
      (call) => call.key === "POST /api/v1/auth/verify-email",
    );
    expect(verifyCalls).toHaveLength(1);
  });

  test("an expired link says so and asks a signed out visitor to sign in", async ({
    page,
    request,
  }) => {
    const token = await mintToken(request, "verify", "expired");
    await page.goto(`/verify-email?token=${token}`);
    await expect(page.getByText("This link has expired")).toBeVisible();
    await page.getByRole("button", { name: "Send a new link" }).click();
    await expect(page.getByText(/Sign in first/)).toBeVisible();
  });

  test("a signed in visitor can request a new link, then waits for the cooldown", async ({
    page,
    request,
  }) => {
    await page.goto("/register");
    await page.getByLabel("Your name").fill("Ada Lovelace");
    await page.getByLabel("Email").fill(uniqueEmail("verify"));
    await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
    await page.getByRole("button", { name: "Create account" }).click();
    await page.waitForURL("**/dashboard");

    const token = await mintToken(request, "verify", "expired");
    await page.goto(`/verify-email?token=${token}`);
    await page.getByRole("button", { name: "Send a new link" }).click();
    await expect(page.getByText(/new link is on its way/)).toBeVisible();
    await expect(
      page.getByRole("button", { name: /You can ask for another link in/ }),
    ).toBeDisabled();
  });

  test("a missing token shows the expired state without calling the API", async ({
    page,
    request,
  }) => {
    await page.goto("/verify-email");
    await expect(page.getByText("This link has expired")).toBeVisible();
    const calls = await mockCalls(request);
    expect(calls.some((call) => call.key.endsWith("/auth/verify-email"))).toBe(false);
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
  for (const path of [
    "/login",
    "/register",
    "/forgot-password",
    "/reset-password",
    "/verify-email",
  ]) {
    await page.goto(`${path}?nosplash`);
    await page.waitForTimeout(1800); // let the leaves load after idle
  }
  expect(problems).toEqual([]);
});
