import { expect, test } from "@playwright/test";
import { callsTo, resetMock, sessionCookieNames, signIn } from "./helpers";

test.beforeEach(async () => {
  await resetMock();
});

test.describe("member shell", () => {
  test("shows the member header with the current page marked", async ({ page, context }) => {
    await signIn(context);
    await page.goto("/dashboard");
    const nav = page.getByRole("navigation", { name: "Primary" });
    await expect(nav.getByRole("link", { name: "Dashboard" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(nav.getByRole("link", { name: "Scan a leaf" })).toHaveAttribute("href", "/scan");
    await expect(nav.getByRole("link", { name: "History" })).toHaveAttribute("href", "/scans");
    await expect(page.getByRole("button", { name: /sound/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /theme/i })).toBeVisible();
    await expect(page.getByRole("button", { name: "Open account menu" })).toHaveText("AL");
  });

  test("signs out from the user menu and clears the session", async ({ page, context }) => {
    await signIn(context);
    await page.goto("/dashboard");
    await page.getByRole("button", { name: "Open account menu" }).click();
    await expect(page.getByText("ada@example.com")).toBeVisible();
    await page.getByRole("button", { name: "Sign out" }).click();

    await expect(page).toHaveURL(/\/$/);
    expect(await sessionCookieNames(context)).toEqual([]);
    expect(await callsTo("POST", "/auth/logout")).toHaveLength(1);
    await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();

    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login\?next=%2Fdashboard/);
  });

  test("the user menu works with the keyboard", async ({ page, context }) => {
    await signIn(context);
    await page.goto("/dashboard");
    const trigger = page.getByRole("button", { name: "Open account menu" });
    await trigger.focus();
    await page.keyboard.press("Enter");
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: "Account" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await expect(trigger).toBeFocused();
  });

  test("guests see the public header and are sent to sign in for member pages", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Open account menu" })).toHaveCount(0);
    await page.goto("/account");
    await expect(page).toHaveURL(/\/login\?next=%2Faccount/);
  });

  test("a revoked session goes back to sign in", async ({ page, context }) => {
    await signIn(context);
    await context.clearCookies({ name: "leafy_at" });
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
    await expect(page).toHaveURL(/reason=session_expired/);
  });
});

test.describe("no email gate", () => {
  test("a member with an unverified address sees no banner and can scan", async ({
    page,
    context,
  }) => {
    await resetMock({ user: { email_verified: false, email_verified_at: null } });
    await signIn(context);
    await page.goto("/dashboard");
    await expect(page.getByRole("region", { name: "Email verification" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Scan a leaf" }).first()).toHaveAttribute(
      "href",
      "/scan",
    );
    expect(await callsTo("POST", "/auth/resend-verification")).toHaveLength(0);
  });
});

test.describe("phone navigation", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("shows the bottom nav with Scan in the centre and hides the header links", async ({
    page,
    context,
  }) => {
    await signIn(context);
    await page.goto("/dashboard");
    const bottom = page.getByRole("navigation", { name: "Main" });
    await expect(bottom).toBeVisible();
    const links = bottom.getByRole("link");
    await expect(links).toHaveCount(5);
    await expect(links.nth(2)).toHaveAttribute("href", "/scan");
    await expect(links.nth(0)).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("navigation", { name: "Primary" })).toBeHidden();

    // Touch targets stay at least 44px.
    for (const index of [0, 1, 2, 3, 4]) {
      const box = await links.nth(index).boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
      expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
    }
  });

  test("the bottom nav does not cover the page content", async ({ page, context }) => {
    await signIn(context);
    await page.goto("/account");
    const geometry = await page.evaluate(() => {
      const nav = document.querySelector(".bottom-nav")?.getBoundingClientRect();
      const stage = document.querySelector(".stage-fill")?.getBoundingClientRect();
      return { navTop: nav?.top ?? 0, stageBottom: stage?.bottom ?? 0 };
    });
    expect(geometry.stageBottom).toBeLessThanOrEqual(geometry.navTop + 1);
  });
});
