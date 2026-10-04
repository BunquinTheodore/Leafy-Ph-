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

export const MAILPIT = process.env.MAILPIT_URL ?? "http://127.0.0.1:8025";
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

interface MailSummary {
  ID: string;
  Subject: string;
  Created: string;
}

/** Polls Mailpit until a message to `to` whose subject contains `subject` arrives. */
export async function waitForMail(
  request: APIRequestContext,
  to: string,
  subject: string,
  minCount = 1,
): Promise<{ id: string; text: string }> {
  const query = encodeURIComponent(`to:${to}`);
  let found: MailSummary[] = [];
  await expect
    .poll(
      async () => {
        const reply = await request.get(`${MAILPIT}/api/v1/search?query=${query}`);
        const body = (await reply.json()) as { messages?: MailSummary[] };
        found = (body.messages ?? []).filter((message) => message.Subject.includes(subject));
        return found.length;
      },
      { message: `mail "${subject}" to ${to}`, timeout: 20_000 },
    )
    .toBeGreaterThanOrEqual(minCount);
  const latest = [...found].sort((a, b) => b.Created.localeCompare(a.Created))[0];
  const detail = await request.get(`${MAILPIT}/api/v1/message/${latest?.ID}`);
  const message = (await detail.json()) as { Text: string };
  return { id: latest?.ID ?? "", text: message.Text };
}

/** The first app link in a mail body (the path and query only, so it works on any base URL). */
export function linkFrom(text: string, pathname: string): string {
  const match = new RegExp(String.raw`https?://\S+?${pathname}\?token=[A-Za-z0-9_-]+`).exec(text);
  if (!match) throw new Error(`No ${pathname} link in the mail:\n${text}`);
  const url = new URL(match[0]);
  return `${url.pathname}${url.search}`;
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

export async function verifyViaMail(
  page: Page,
  request: APIRequestContext,
  email: string,
): Promise<void> {
  const mail = await waitForMail(request, email, "Verify your Leafy email");
  await page.goto(linkFrom(mail.text, "/verify-email"));
  await expect(page.getByRole("heading", { name: "Email verified" })).toBeVisible();
}

export async function signInViaUi(page: Page, email: string, password = PASSWORD): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/dashboard");
}

/** A registered, verified member in its own browser context; returns the page and the email. */
export async function newMember(
  browser: Browser,
  baseURL: string,
  prefix = "member",
): Promise<{ page: Page; email: string; close: () => Promise<void> }> {
  const context = await browser.newContext({ baseURL });
  const page = waitForHydration(await context.newPage());
  const email = uniqueEmail(prefix);
  await registerViaUi(page, { email });
  await verifyViaMail(page, context.request, email);
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
