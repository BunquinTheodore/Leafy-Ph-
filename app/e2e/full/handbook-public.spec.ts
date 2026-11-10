import { expect, test } from "./support";

// TC-006: the handbook is public. A fresh browser with no cookies and no session opens a plant
// and one of its disease entries and sees the details, without being sent to sign in.
test("a signed out visitor opens a plant and a disease in the handbook", async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({ baseURL });
  try {
    expect(await context.cookies()).toHaveLength(0);
    const page = await context.newPage();

    const plant = await page.goto("/handbook/tomato?nosplash");
    expect(plant?.status()).toBe(200);
    await expect(page).toHaveURL(/\/handbook\/tomato/);
    await expect(page.getByRole("heading", { name: /tomato/i }).first()).toBeVisible();

    const link = page.locator('a[href^="/handbook/tomato/"]').first();
    const href = await link.getAttribute("href");
    expect(href).toMatch(/^\/handbook\/tomato\/[a-z0-9-]+$/);

    const disease = await page.goto(`${href}?nosplash`);
    expect(disease?.status()).toBe(200);
    await expect(page).toHaveURL(new RegExp(`${href}`));
    await expect(page).not.toHaveURL(/sign-?in|login|register/);
    await expect(page.locator("main")).toContainText(/symptoms|treatment/i);
  } finally {
    await context.close();
  }
});
