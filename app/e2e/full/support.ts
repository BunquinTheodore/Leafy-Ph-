import {
  expect,
  test as base,
  type APIRequestContext,
  type Browser,
  type Page,
} from "@playwright/test";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

const HYDRATION_TIMEOUT_MS = 15_000;

/**
 * Makes page.goto wait until the app has hydrated (SplashReady sets window.__leafyReady and the
 * network is quiet), so a test never types into a form that React is about to reset.
 */
export function waitForHydration(page: Page): Page {
  const goto = page.goto.bind(page);
  page.goto = (async (url: string, options?: Parameters<Page["goto"]>[1]) => {
    const response = await goto(url, options);
    if (options?.waitUntil === "commit") return response;
    await page
      .waitForFunction(() => (window as { __leafyReady?: boolean }).__leafyReady === true, null, {
        timeout: HYDRATION_TIMEOUT_MS,
      })
      .catch(() => undefined);
    // Streamed client components hydrate after the root marker: let the network go quiet, then
    // give React a frame, so typed values are not reset by a late hydration.
    await page.waitForLoadState("networkidle").catch(() => undefined);
    await page.evaluate(
      () => new Promise<void>((done) => requestAnimationFrame(() => setTimeout(done, 100))),
    );
    return response;
  }) as Page["goto"];
  return page;
}

export const test = base.extend({
  page: async ({ page }, run) => {
    await run(waitForHydration(page));
  },
});
export { expect };

export const S3 = process.env.S3_URL ?? "http://127.0.0.1:9000";
export const PASSWORD = "a long passphrase here";
export const API_DIR = resolve(__dirname, "../../../api");
export const PHOTOS_DIR = resolve(API_DIR, "app/seeds/plant_photos");
export const photo = (name = "tomato.jpg"): string => resolve(PHOTOS_DIR, name);

let counter = 0;
export function uniqueEmail(prefix: string): string {
  counter += 1;
  const stamp = `${Date.now().toString(36)}${counter}${Math.random().toString(36).slice(2, 6)}`;
  return `${prefix}.${stamp}@example.com`;
}

export async function registerViaUi(
  page: Page,
  details: { email: string; first?: string; last?: string; password?: string },
): Promise<void> {
  await page.goto("/register");
  await page
    .getByLabel("Your name")
    .fill(`${details.first ?? "Ada"} ${details.last ?? "Lovelace"}`);
  await page.getByLabel("Email").fill(details.email);
  await page.getByLabel("Password", { exact: true }).fill(details.password ?? PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL("**/dashboard");
}

/**
 * Continue with Google through the mock provider (the web builds a test signed Firebase ID token,
 * the API trusts it only with GOOGLE_MOCK=1). `email` picks the identity; ends on `next`.
 */
export async function googleSignInViaUi(page: Page, email: string, next?: string): Promise<void> {
  const params = new URLSearchParams({ mock_google_email: email });
  if (next) params.set("next", next);
  await page.goto(`/login?${params.toString()}`);
  await page.getByRole("button", { name: "Continue with Google" }).click();
}

export async function signInViaUi(page: Page, email: string, password = PASSWORD): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/dashboard");
}

/** A registered member in its own browser context; returns the page and the email. */
export async function newMember(
  browser: Browser,
  baseURL: string,
  prefix = "member",
): Promise<{ page: Page; email: string; close: () => Promise<void> }> {
  const context = await browser.newContext({ baseURL });
  const page = waitForHydration(await context.newPage());
  const email = uniqueEmail(prefix);
  await registerViaUi(page, { email });
  return { page, email, close: () => context.close() };
}

export async function currentUserId(page: Page): Promise<string> {
  const reply = await page.request.get("/api/me");
  expect(reply.ok()).toBe(true);
  const body = (await reply.json()) as { data: { id: string } };
  return body.data.id;
}

/** Object keys in the scans bucket under a user's prefix (S3 ListObjectsV2). */
export async function scanObjectKeys(
  request: APIRequestContext,
  userId: string,
): Promise<string[]> {
  const reply = await request.get(`${S3}/leafy-scans?list-type=2&prefix=${userId}/`);
  expect(reply.ok()).toBe(true);
  const xml = await reply.text();
  return [...xml.matchAll(/<Key>([^<]+)<\/Key>/g)].map((match) => match[1] ?? "");
}

/** Runs the storage purge job once, the same drain the API also triggers after a deletion. */
export function runPurgeJob(): void {
  const python = resolve(API_DIR, ".venv/Scripts/python.exe");
  execFileSync(python, ["-m", "app.jobs.purge_storage"], {
    cwd: API_DIR,
    stdio: "ignore",
    env: {
      DATABASE_URL: "postgresql+asyncpg://leafy:leafy-dev-only@127.0.0.1:5433/leafy",
      JWT_SECRET: "leafy-local-dev-only-jwt-secret-0123456789",
      S3_ENDPOINT_URL: S3,
      S3_ACCESS_KEY: "dev",
      S3_SECRET_KEY: "dev-only-secret",
      ...process.env,
    },
  });
}

/** Uploads a sample photo on /scan and waits for a finished result or failure. */
export async function scanPhoto(page: Page, name = "tomato.jpg"): Promise<void> {
  await page.goto("/scan");
  await page.getByTestId("photo-input").setInputFiles(photo(name));
  await expect(page.getByTestId("preview-image")).toBeVisible();
  await page.getByRole("button", { name: "Analyze leaf" }).click();
}
