import { expect, type BrowserContext, type Page } from "@playwright/test";

const API = `http://127.0.0.1:${process.env.MOCK_API_PORT ?? "4100"}`;
const APP = `http://localhost:${process.env.MEMBER_APP_PORT ?? "3100"}`;

export interface MockCall {
  method: string;
  path: string;
  body: Record<string, unknown> | null;
}

export interface MockState {
  calls: MockCall[];
  user: { first_name: string; last_name: string; auth_methods: string[] };
  password: string;
  hasPassword: boolean;
  deleted: boolean;
}

/** Starts a scenario on the mock API. Pass any part of its state to override the defaults. */
export async function resetMock(scenario: Record<string, unknown> = {}): Promise<void> {
  const response = await fetch(`${API}/__mock/reset`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(scenario),
  });
  expect(response.ok).toBe(true);
}

export async function mockState(): Promise<MockState> {
  const response = await fetch(`${API}/__mock/state`);
  return (await response.json()) as MockState;
}

/** Calls the mock saw for one path, in order. */
export async function callsTo(method: string, path: string): Promise<MockCall[]> {
  const state = await mockState();
  return state.calls.filter((call) => call.method === method && call.path === path);
}

function jwtWithExp(expSeconds: number): string {
  const enc = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${enc({ alg: "HS256", typ: "JWT" })}.${enc({ sub: "u1", exp: expSeconds })}.sig`;
}

/** Signed in cookies the middleware accepts (a JWT that expires in an hour). */
export async function signIn(context: BrowserContext, theme?: "dark" | "light"): Promise<void> {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const cookies = [
    { name: "leafy_at", value: jwtWithExp(exp), url: APP, httpOnly: true },
    { name: "leafy_rt", value: "rt-member-e2e", url: APP, httpOnly: true },
  ];
  if (theme) cookies.push({ name: "leafy_theme", value: theme, url: APP, httpOnly: false });
  await context.addCookies(cookies);
}

export async function sessionCookieNames(context: BrowserContext): Promise<string[]> {
  const cookies = await context.cookies(APP);
  return cookies
    .filter((cookie) => cookie.value !== "" && cookie.name.startsWith("leafy_"))
    .map((cookie) => cookie.name);
}

/** Number of text lines an element occupies. */
export async function lineCount(page: Page, selector: string): Promise<number> {
  return page.evaluate((sel) => {
    const element = document.querySelector(sel);
    if (!element) return 0;
    const range = document.createRange();
    range.selectNodeContents(element);
    return new Set([...range.getClientRects()].map((rect) => Math.round(rect.top / 4))).size;
  }, selector);
}

export async function documentHeightRatio(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollHeight / window.innerHeight);
}

export const APP_ORIGIN = APP;

/**
 * Waits until the app has hydrated (the root marker is set and the network is quiet), so a test
 * never fills or submits a form that React is about to take over. Without this a click can land
 * on the server rendered form and reload the page instead of running the handler.
 */
export async function waitForHydration(page: Page): Promise<void> {
  await page
    .waitForFunction(() => (window as { __leafyReady?: boolean }).__leafyReady === true, null, {
      timeout: 15_000,
    })
    .catch(() => undefined);
  await page.waitForLoadState("networkidle").catch(() => undefined);
  await page.evaluate(
    () => new Promise<void>((done) => requestAnimationFrame(() => setTimeout(done, 100))),
  );
}
