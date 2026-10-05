import { expect, test, type Browser, type BrowserContext } from "@playwright/test";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { measureLayout, type LayoutReport } from "./measure";
import config from "./routes.json";

const BASE = process.env.BASE_URL ?? "http://localhost:3200";
const MAX_LINES = 2;
const MIN_GROUP_RATIO = 0.6;
const MAX_MARGIN_DIFF_RATIO = 0.12;
const MAX_GAP_RATIO = 0.18;
// Design rule (2): a heading block and its companion are at most about 120px apart (plus tolerance).
const MAX_GAP_PX = 160;
const MAX_DOC_RATIO = 1.15;
const WIDE_FROM = 1440;

interface RouteEntry {
  name: string;
  path: string;
  auth: boolean;
  hash?: string;
  exempt?: boolean;
}

const routes = config.routes as RouteEntry[];
const viewports = config.viewports.filter((vp) => config.specViewports.includes(vp.name));
let storageState: unknown = null;
let scanId: string | null = null;
let diseaseScanId: string | null = null;

function newContext(browser: Browser, width: number, height: number, auth: boolean) {
  return browser.newContext({
    viewport: { width, height },
    reducedMotion: "reduce",
    colorScheme: "dark",
    storageState: auth ? (storageState as never) : undefined,
  });
}

async function probe(context: BrowserContext, path: string, hash?: string): Promise<LayoutReport> {
  const page = await context.newPage();
  await page.goto(`${BASE}${path}${hash ? `#${hash}` : ""}`, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(500);
  const report = await page.evaluate(`(${measureLayout.toString()})()`);
  await page.close();
  return report as LayoutReport;
}

test.beforeAll(async ({ browser }) => {
  // Public-only runs (LAYOUT_NO_AUTH=1) skip the demo login so they never hit the login rate limit.
  if (process.env.LAYOUT_NO_AUTH) return;
  // Native import: Playwright would otherwise transpile the .mjs helper to CommonJS and break it.
  const nativeImport = new Function("href", "return import(href)") as (href: string) => Promise<{
    loginDemo: (origin: string) => Promise<{ storageState: unknown }>;
  }>;
  const { loginDemo } = await nativeImport(
    pathToFileURL(resolve(process.cwd(), "scripts", "demo-session.mjs")).href,
  );
  storageState = (await loginDemo(BASE)).storageState;
  const context = await newContext(browser, 1280, 720, true);
  const res = await context.request.get(`${BASE}/api/scans?limit=1`);
  const body = (await res.json().catch(() => null)) as {
    data?: { items?: { id: string }[] };
  } | null;
  scanId = body?.data?.items?.[0]?.id ?? null;
  const sick = await context.request.get(`${BASE}/api/scans?limit=1&verdict=disease`);
  const sickBody = (await sick.json().catch(() => null)) as typeof body;
  diseaseScanId = sickBody?.data?.items?.[0]?.id ?? null;
  await context.close();
});

for (const route of routes) {
  for (const vp of viewports) {
    test(`${route.name} @ ${vp.name}`, async ({ browser }) => {
      if (route.path.includes("@first")) test.skip(!scanId, "demo user has no scans");
      if (route.path.includes("@disease")) test.skip(!diseaseScanId, "no disease scan");
      const path = route.path
        .replace("@first", scanId ?? "")
        .replace("@disease", diseaseScanId ?? "");
      const context = await newContext(browser, vp.width, vp.height, route.auth);
      const r = await probe(context, path, route.hash);
      await context.close();

      const problems: string[] = [];
      // Guard against a vacuous pass: a page with no measurable content is a failure.
      if (!r.group || r.headings.length === 0)
        problems.push("no measurable content or headings found");
      if (r.hOverflow > 1) problems.push(`horizontal overflow ${r.hOverflow}px`);
      for (const h of r.headings)
        if (h.lines > MAX_LINES) problems.push(`heading "${h.text}" has ${h.lines} lines`);
      if (r.group && vp.width >= WIDE_FROM) {
        const ratio = (r.group.r - r.group.l) / r.vw;
        if (ratio < MIN_GROUP_RATIO)
          problems.push(
            `content group spans ${(ratio * 100).toFixed(0)}% of width (need ${MIN_GROUP_RATIO * 100}%)`,
          );
        const diff = Math.abs(r.group.l - (r.vw - r.group.r)) / r.vw;
        if (diff > MAX_MARGIN_DIFF_RATIO)
          problems.push(
            `margins differ by ${(diff * 100).toFixed(0)}% of width (left ${Math.round(r.group.l)}, right ${Math.round(r.vw - r.group.r)})`,
          );
      }
      if (vp.width >= WIDE_FROM && (r.maxXGap / r.vw > MAX_GAP_RATIO || r.maxXGap > MAX_GAP_PX))
        problems.push(
          `empty middle: ${Math.round(r.maxXGap)}px strip with no content (${((r.maxXGap / r.vw) * 100).toFixed(0)}% of width)`,
        );
      for (const g of r.headingGaps)
        if (g.gap / r.vw > MAX_GAP_RATIO || g.gap > MAX_GAP_PX)
          problems.push(
            `heading "${g.text}" is ${Math.round(g.gap)}px from its companion ${g.with ?? ""} (${((g.gap / r.vw) * 100).toFixed(0)}% of width)`,
          );
      for (const d of r.decorNotHidden) problems.push(`decor ${d} is not aria-hidden`);
      for (const hit of r.decorHits) problems.push(`decor ${hit.decor} overlaps ${hit.content}`);
      if (!route.exempt && r.docRatio > MAX_DOC_RATIO)
        problems.push(`document height ${r.docRatio.toFixed(2)}x viewport`);
      for (const o of r.cardOverlaps) problems.push(`cards overlap: ${o}`);

      expect(problems, problems.join("\n")).toEqual([]);
    });
  }
}
