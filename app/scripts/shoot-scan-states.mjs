// Screenshots of the scan journey states that need a mocked API reply (preview, uploading,
// processing, failed, error, running cards in history, grid view).
//   node scripts/shoot-scan-states.mjs <baseUrl> <outDir> [viewports,comma] [themes,comma]
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
  base = "http://localhost:3205",
  out = "../docs/screens/wide-layout/scan/states",
  onlyVp,
  onlyTheme,
] = process.argv.slice(2);
const viewports = onlyVp
  ? config.viewports.filter((vp) => onlyVp.split(",").includes(vp.name))
  : config.viewports;
const themes = onlyTheme ? onlyTheme.split(",") : ["dark", "light"];
mkdirSync(out, { recursive: true });

const photo = resolve(here, "..", "..", "api", "app", "seeds", "plant_photos", "apple.jpg");
const session = await loginDemo(base);
const browser = await chromium.launch();
const envelope = (data) => ({ success: true, data, error: null, meta: null });

async function realDetail(context) {
  const list = await (await context.request.get(`${base}/api/scans?limit=1`)).json();
  const id = list.data.items[0].id;
  return (await (await context.request.get(`${base}/api/scans/${id}`)).json()).data;
}

const states = {
  async preview(page) {
    await page.goto(`${base}/scan`);
    await page.setInputFiles('[data-testid="photo-input"]', photo);
    await page.waitForSelector('[data-testid="preview-image"]');
  },
  async uploading(page) {
    await page.route("**/api/scans", (route) =>
      route.request().method() === "POST" ? new Promise(() => {}) : route.continue(),
    );
    await states.preview(page);
    await page.click("text=Analyze");
    await page.waitForSelector('[data-testid="progress-panel"]');
  },
  async processing(page, detail) {
    await page.route("**/api/scans", (route) =>
      route.request().method() === "POST"
        ? route.fulfill({
            status: 202,
            contentType: "application/json",
            body: JSON.stringify(
              envelope({ id: detail.id, status: "processing", stage: "analyzing" }),
            ),
          })
        : route.continue(),
    );
    await page.route(`**/api/scans/${detail.id}`, (route) =>
      route.request().method() === "GET"
        ? route.fulfill({
            contentType: "application/json",
            body: JSON.stringify(
              envelope({ ...detail, status: "processing", stage: "analyzing", verdict: null }),
            ),
          })
        : route.continue(),
    );
    await states.preview(page);
    await page.click("text=Analyze");
    await page.waitForSelector('[data-testid="progress-panel"]');
    await page.waitForTimeout(1500);
  },
  async failed(page, detail) {
    await page.route("**/api/scans", (route) =>
      route.request().method() === "POST"
        ? route.fulfill({
            status: 202,
            contentType: "application/json",
            body: JSON.stringify(
              envelope({ id: detail.id, status: "processing", stage: "analyzing" }),
            ),
          })
        : route.continue(),
    );
    await page.route(`**/api/scans/${detail.id}`, (route) =>
      route.request().method() === "GET"
        ? route.fulfill({
            contentType: "application/json",
            body: JSON.stringify(
              envelope({
                ...detail,
                status: "failed",
                failure_code: "ml_unavailable",
                verdict: null,
              }),
            ),
          })
        : route.continue(),
    );
    await states.preview(page);
    await page.click("text=Analyze");
    await page.waitForSelector('[data-testid="failed-view"]', { timeout: 15000 });
  },
  async error(page) {
    await page.route("**/api/scans", (route) =>
      route.request().method() === "POST"
        ? route.fulfill({
            status: 503,
            contentType: "application/json",
            body: JSON.stringify({
              success: false,
              data: null,
              error: { code: "ml_unavailable", message: "x", details: null },
            }),
          })
        : route.continue(),
    );
    await states.preview(page);
    await page.click("text=Analyze");
    await page.waitForSelector('[data-testid="scan-error"]');
  },
  async grid(page) {
    await page.addInitScript(() => localStorage.setItem("leafy-history-view", "grid"));
    await page.goto(`${base}/scans`);
    await page.waitForSelector('[data-testid="history-list"]');
  },
  async running(page) {
    await page.route("**/api/scans?*", async (route) => {
      const res = await route.fetch();
      const body = await res.json();
      body.data.items = body.data.items.map((item, i) =>
        i === 0
          ? { ...item, status: "processing", stage: "analyzing", verdict: null }
          : i === 1
            ? { ...item, status: "failed", failure_code: "ml_unavailable", verdict: null }
            : item,
      );
      await route.fulfill({ response: res, body: JSON.stringify(body) });
    });
    await page.goto(`${base}/scans`);
    await page.selectOption('[data-testid="filter-verdict"]', "healthy");
    await page.waitForTimeout(1200);
  },
};

const only = process.env.STATES ? process.env.STATES.split(",") : Object.keys(states);
let count = 0;
for (const theme of themes) {
  for (const vp of viewports) {
    for (const name of only) {
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        colorScheme: theme,
        reducedMotion: "reduce",
        storageState: session.storageState,
      });
      const page = await context.newPage();
      const detail = await realDetail(context);
      try {
        await states[name](page, detail);
        await page.waitForTimeout(700);
        await page.screenshot({ path: `${out}/${name}-${vp.name}-${theme}.png` });
        count += 1;
      } catch (error) {
        console.error(`FAILED ${name} ${vp.name} ${theme}: ${error.message.split("\n")[0]}`);
      }
      await context.close();
    }
  }
}
await browser.close();
console.log(`wrote ${count} screenshots to ${out}`);
