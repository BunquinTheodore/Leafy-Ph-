// Brand checkpoint: screenshots plus layout assertions against a running production build.
//   pnpm build && API_INTERNAL_URL=http://localhost:8000 APP_ORIGIN=http://localhost:3000 pnpm start
//   node scripts/brand-checkpoint.mjs            (BASE_URL defaults to http://localhost:3000)
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, "..", "..", "docs", "brand-checkpoint");
const base = process.env.BASE_URL ?? "http://localhost:3000";
mkdirSync(outDir, { recursive: true });

const viewports = [
  { name: "1440", width: 1440, height: 900 },
  { name: "390", width: 390, height: 844 },
];
const brandPanels = ["logo", "color", "type", "voice", "components", "motion", "rules"];
const MAX_SCROLL_RATIO = 1.15;
// Screens that wait for the brand approval; links to them are prefetched and 404 for now.
const UNBUILT_ROUTES = ["/handbook", "/login", "/scan"];
const report = { shots: [], failures: [], notes: [] };

const fail = (message) => report.failures.push(message);

async function newPage(browser, viewport, { theme = "dark", webdriver = false } = {}) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 1,
  });
  await context.addInitScript(
    ({ theme: t, webdriver: w }) => {
      try {
        localStorage.setItem("leafy-theme", t);
        localStorage.setItem("leafy-sfx", "0");
      } catch {}
      if (!w) Object.defineProperty(navigator, "webdriver", { get: () => false });
      new MutationObserver(() => {
        const splash = document.getElementById("leafy-splash");
        if (splash?.getAttribute("data-state") === "leaving" && window.__splashGoneAt === undefined)
          window.__splashGoneAt = performance.now();
      }).observe(document, { attributes: true, subtree: true, attributeFilter: ["data-state"] });
    },
    { theme, webdriver },
  );
  const page = await context.newPage();
  const errors = [];
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (response.status() === 404 && !UNBUILT_ROUTES.some((route) => url.pathname === route))
      errors.push(`404 ${url.pathname}`);
  });
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    // Resource 404s are reported by the response listener above with their URL.
    if (message.type() === "error" && !message.text().includes("Failed to load resource"))
      errors.push(`console: ${message.text()}`);
  });
  return { page, context, errors };
}

async function shot(page, name) {
  const file = join(outDir, `${name}.png`);
  await page.screenshot({ path: file });
  report.shots.push(file);
}

async function waitForSplashGone(page) {
  await page
    .waitForSelector("#leafy-splash", { state: "hidden", timeout: 6000 })
    .catch(() => fail("splash did not hide within 6s"));
}

/** Lines of text per heading, measured with Range rects. */
async function headingLines(page) {
  return page.evaluate(() =>
    [...document.querySelectorAll("h1, h2")]
      .filter((el) => el.offsetParent !== null && el.closest("[inert]") === null)
      .map((el) => {
        const range = document.createRange();
        range.selectNodeContents(el);
        const tops = new Set([...range.getClientRects()].map((r) => Math.round(r.top / 4)));
        return { text: el.textContent?.trim().slice(0, 40) ?? "", lines: tops.size };
      }),
  );
}

async function hyphenationReport(page) {
  return page.evaluate(() => {
    const bad = [];
    for (const el of document.querySelectorAll("body *")) {
      const style = getComputedStyle(el);
      if (style.hyphens !== "none" && style.display !== "none" && el.childNodes.length)
        bad.push(el.tagName + "." + el.className);
      if (el.children.length === 0 && el.textContent?.includes("­"))
        bad.push("soft hyphen in " + el.tagName);
    }
    return bad.slice(0, 5);
  });
}

async function overlapReport(page, selectors) {
  return page.evaluate((sels) => {
    const boxes = sels
      .map((selector) => {
        const el = document.querySelector(selector);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { selector, left: r.left, right: r.right, top: r.top, bottom: r.bottom };
      })
      .filter(Boolean);
    const overlaps = [];
    for (let i = 0; i < boxes.length; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) {
        const a = boxes[i];
        const b = boxes[j];
        const x = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const y = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (x > 1 && y > 1) overlaps.push(`${a.selector} x ${b.selector}`);
      }
    }
    return overlaps;
  }, selectors);
}

async function checkPage(page, label, viewport, { overlapSelectors = [], scroll = true } = {}) {
  const metrics = await page.evaluate(() => ({
    height: document.documentElement.scrollHeight,
    width: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
  const ratio = metrics.height / viewport.height;
  report.notes.push(
    `${label}: document height ${metrics.height}px = ${ratio.toFixed(3)} x viewport`,
  );
  if (scroll && ratio > MAX_SCROLL_RATIO)
    fail(`${label}: document is ${ratio.toFixed(2)} x viewport (max ${MAX_SCROLL_RATIO})`);
  if (metrics.width > metrics.client + 1)
    fail(`${label}: horizontal document scroll (${metrics.width} > ${metrics.client})`);
  for (const heading of await headingLines(page)) {
    report.notes.push(`${label}: heading "${heading.text}" = ${heading.lines} line(s)`);
    if (heading.lines > 2)
      fail(`${label}: heading "${heading.text}" wraps to ${heading.lines} lines`);
  }
  const bad = await hyphenationReport(page);
  if (bad.length) fail(`${label}: hyphenation not disabled on ${bad.join(", ")}`);
  const overlaps = await overlapReport(page, overlapSelectors);
  if (overlaps.length) fail(`${label}: overlapping elements ${overlaps.join(", ")}`);
}

async function main() {
  const browser = await chromium.launch({
    args: [
      "--use-gl=angle",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
      "--ignore-gpu-blocklist",
      "--enable-webgl",
    ],
  });
  try {
    for (const viewport of viewports) {
      // Splash, caught mid animation with the wordmark letters in.
      {
        const { page, context } = await newPage(browser, viewport);
        await page.goto(`${base}/`, { waitUntil: "commit" });
        await page.waitForSelector("#leafy-splash");
        await page.waitForTimeout(500);
        await shot(page, `splash-${viewport.name}`);
        await waitForSplashGone(page);
        const goneAt = await page.evaluate(() => window.__splashGoneAt);
        report.notes.push(
          `splash ${viewport.name}: started leaving ${Math.round(goneAt ?? -1)}ms after navigation start`,
        );
        if (goneAt === undefined || goneAt < 900)
          fail(`splash ${viewport.name}: left before the 0.9s minimum (${goneAt}ms)`);
        if (goneAt > 2300)
          fail(`splash ${viewport.name}: left after ${Math.round(goneAt)}ms (max about 2200)`);
        await context.close();
      }

      for (const theme of ["dark", "light"]) {
        const { page, context, errors } = await newPage(browser, viewport, { theme });
        await page.goto(`${base}/`, { waitUntil: "load" });
        await waitForSplashGone(page);
        await page
          .waitForSelector('.hero__scene[data-ready="true"]', { timeout: 15000 })
          .catch(() => fail(`landing ${theme} ${viewport.name}: 3D scene never became ready`));
        await page.waitForTimeout(1600);
        await shot(page, `landing-${theme}-${viewport.name}`);
        await checkPage(page, `landing ${theme} ${viewport.name}`, viewport, {
          overlapSelectors: [
            "#hero-title",
            ".hero .blurb",
            ".hero__actions",
            ".eyebrow",
            ".site-header",
          ],
        });
        if (errors.length) fail(`landing ${theme} ${viewport.name}: ${errors.join(" | ")}`);
        await context.close();
      }

      // Brand guide: first panel in dark and light, then every panel in dark.
      for (const theme of ["dark", "light"]) {
        const { page, context, errors } = await newPage(browser, viewport, { theme });
        await page.goto(`${base}/brand`, { waitUntil: "load" });
        await waitForSplashGone(page);
        await page.waitForTimeout(500);
        await shot(page, `brand-${theme}-${viewport.name}`);
        await checkPage(page, `brand ${theme} ${viewport.name}`, viewport);
        if (theme === "dark") {
          for (const panel of brandPanels) {
            await page.evaluate((id) => {
              window.location.hash = id;
            }, panel);
            await page.waitForTimeout(900);
            await shot(page, `brand-${panel}-${viewport.name}`);
            await checkPage(page, `brand #${panel} ${viewport.name}`, viewport);
          }
        }
        if (errors.length) fail(`brand ${theme} ${viewport.name}: ${errors.join(" | ")}`);
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
  writeFileSync(join(outDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(report.notes.join("\n"));
  console.log(`\n${report.shots.length} screenshots in ${outDir}`);
  if (report.failures.length) {
    console.log(
      `\nFAILURES (${report.failures.length}):\n${report.failures.map((f) => ` - ${f}`).join("\n")}`,
    );
    process.exitCode = 1;
  } else {
    console.log("\nAll layout checks passed.");
  }
}

await main();
