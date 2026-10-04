import { readdirSync } from "node:fs";
import path from "node:path";
import { expect, type APIRequestContext, type Page } from "@playwright/test";

export const API = `http://127.0.0.1:${process.env.AUTH_E2E_API_PORT ?? 4147}`;

export async function resetMock(request: APIRequestContext): Promise<void> {
  const response = await request.post(`${API}/__test/reset`, { data: {} });
  expect(response.ok()).toBe(true);
}

export async function mintToken(
  request: APIRequestContext,
  type: "verify" | "reset",
  state: "valid" | "expired" = "valid",
): Promise<string> {
  const response = await request.post(`${API}/__test/token`, { data: { type, state } });
  return ((await response.json()) as { token: string }).token;
}

export interface MockCall {
  key: string;
  body: Record<string, unknown>;
  authorization: string | null;
}

export async function mockCalls(request: APIRequestContext): Promise<MockCall[]> {
  const response = await request.get(`${API}/__test/calls`);
  return (await response.json()) as MockCall[];
}

/** Number of lines a text block occupies, from its client rects (a wrapped heading is 2 or more). */
export async function lineCount(page: Page, selector: string): Promise<number> {
  return page.evaluate((sel) => {
    const element = document.querySelector(sel);
    if (!element) return 0;
    const range = document.createRange();
    range.selectNodeContents(element);
    return new Set([...range.getClientRects()].map((rect) => Math.round(rect.top / 4))).size;
  }, selector);
}

/** Path of the axe-core build that ships with the toolchain (a transitive dependency of lhci). */
export function axePath(): string {
  const store = path.resolve(__dirname, "../../../node_modules/.pnpm");
  const folder = readdirSync(store).find((name) => name.startsWith("axe-core@"));
  if (!folder) throw new Error("axe-core is not installed");
  return path.join(store, folder, "node_modules/axe-core/axe.min.js");
}

export async function setTheme(page: Page, theme: "dark" | "light"): Promise<void> {
  await page.evaluate((value) => {
    document.documentElement.setAttribute("data-theme", value);
  }, theme);
}

export const uniqueEmail = (label: string) =>
  `${label}.${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}@example.com`;
