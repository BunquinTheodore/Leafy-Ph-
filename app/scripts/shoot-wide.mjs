// Viewport matrix screenshots for the wide layout work.
//   node scripts/shoot-wide.mjs <baseUrl> <outDir> [routeNames,comma] [viewportNames,comma] [themes,comma]
// Routes and viewports come from tests/e2e-layout/routes.json. Signed in routes use the demo user.
import { chromium } from "@playwright/test";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loginDemo } from "./demo-session.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const config = JSON.parse(
  readFileSync(resolve(here, "..", "tests", "e2e-layout", "routes.json"), "utf8"),
);
const [
  base = "http://localhost:3000",
  out = resolve(here, "..", "..", "docs", "screens", "wide-layout", "foundation"),
  only,
  onlyVp,
  onlyTheme,
] = process.argv.slice(2);
const pick = (list, names, key = "name") =>
  names ? list.filter((item) => names.split(",").includes(item[key])) : list;
const routes = pick(config.routes, only);
const viewports = pick(config.viewports, onlyVp);
const themes = onlyTheme ? onlyTheme.split(",") : ["dark", "light"];
mkdirSync(out, { recursive: true });

const needsAuth = routes.some((route) => route.auth);
const session = needsAuth ? await loginDemo(base) : null;
const browser = await chromium.launch();

async function firstScanId(context, query = "") {
  const res = await context.request.get(`${base}/api/scans?limit=1${query}`);
  const body = await res.json().catch(() => null);
  return body?.data?.items?.[0]?.id ?? null;
}

let count = 0;
for (const theme of themes) {
  for (const vp of viewports) {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      colorScheme: theme,
      storageState: session?.storageState,
    });
    await context.addInitScript((value) => {
      try {
        localStorage.setItem("leafy-theme", value);
      } catch {}
    }, theme);
    const scanId = needsAuth ? await firstScanId(context) : null;
    const diseaseId = needsAuth ? await firstScanId(context, "&verdict=disease") : null;
    for (const route of routes) {
      if (route.path.includes("@first") && !scanId) continue;
      if (route.path.includes("@disease") && !diseaseId) continue;
      const path = route.path.replace("@first", scanId ?? "").replace("@disease", diseaseId ?? "");
      const page = await context.newPage();
      await page.goto(`${base}${path}${route.hash ? `#${route.hash}` : ""}`, { waitUntil: "load" });
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(1800);
      await page.screenshot({ path: resolve(out, `${route.name}-${vp.name}-${theme}.png`) });
      await page.close();
      count += 1;
    }
    await context.close();
  }
}
await browser.close();
console.log(`wrote ${count} screenshots to ${out}`);
