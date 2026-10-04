import { expect, type BrowserContext, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const API = `http://127.0.0.1:${process.env.SCAN_MOCK_API_PORT ?? "4200"}`;
const APP = `http://localhost:${process.env.SCAN_APP_PORT ?? "3200"}`;

export const PHOTO_PATH = resolve(__dirname, "../../../../api/app/seeds/plant_photos/apple.jpg");

export interface MockCall {
  method: string;
  path: string;
  body: Record<string, unknown> | null;
  query: string;
}

interface MockScan {
  id: string;
  feedback: Record<string, unknown> | null;
}

export interface MockState {
  calls: MockCall[];
  scans: MockScan[];
  tokenCounter: number;
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

export async function callsTo(method: string, path: RegExp | string): Promise<MockCall[]> {
  const state = await mockState();
  return state.calls.filter(
    (call) =>
      call.method === method &&
      (typeof path === "string" ? call.path === path : path.test(call.path)),
  );
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
    { name: "leafy_rt", value: "rt-scan-e2e", url: APP, httpOnly: true },
  ];
  if (theme) cookies.push({ name: "leafy_theme", value: theme, url: APP, httpOnly: false });
  await context.addCookies(cookies);
}

export const photoBuffer = (): Buffer => readFileSync(PHOTO_PATH);

/** A JPEG that still decodes but is padded to roughly `bytes` (decoders ignore trailing data). */
export function paddedPhoto(bytes: number): Buffer {
  const base = photoBuffer();
  return Buffer.concat([base, Buffer.alloc(Math.max(0, bytes - base.length), 0)]);
}

/** Chooses the sample photo in the dropzone. */
export async function choosePhoto(page: Page, buffer: Buffer = photoBuffer(), name = "leaf.jpg") {
  await page.getByTestId("photo-input").setInputFiles({ name, mimeType: "image/jpeg", buffer });
}

/** Records every data-step the progress panel shows, in order, in window.__steps. */
export async function recordSteps(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const seen: string[] = [];
    (window as unknown as { __steps: string[] }).__steps = seen;
    const note = () => {
      const step = document
        .querySelector("[data-testid=progress-panel]")
        ?.getAttribute("data-step");
      if (step && seen[seen.length - 1] !== step) seen.push(step);
    };
    new MutationObserver(note).observe(document, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["data-step"],
    });
  });
}

export const seenSteps = (page: Page): Promise<string[]> =>
  page.evaluate(() => (window as unknown as { __steps: string[] }).__steps);

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
export const MOCK_ORIGIN = API;
