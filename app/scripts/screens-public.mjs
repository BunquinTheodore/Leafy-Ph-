// Screenshots of the landing page and the handbook, with layout measurements.
//   Run against a production build:  node scripts/screens-public.mjs   (BASE_URL defaults to http://localhost:3000)
//   Output: docs/screens/public/<name>-<viewport>-<theme>.png and a measurements report on stdout.
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, "..", "..", "docs", "screens", "public");
const base = process.env.BASE_URL ?? "http://localhost:3000";
mkdirSync(outDir, { recursive: true });

const viewports = [
  { name: "1440x900", width: 1440, height: 900 },
  { name: "390x844", width: 390, height: 844 },
];
const themes = ["dark", "light"];
const only = process.env.ONLY ? process.env.ONLY.split(",") : null;

const landingPanels = ["hero", "how-it-works", "plants", "why-leafy", "faq", "start"];
const diseasePanels = ["overview", "causes", "symptoms", "treatment", "prevention", "images"];

const shots = [
  ...landingPanels.map((id) => ({ name: `landing-${id}`, path: "/", hash: id })),
  { name: "handbook-index", path: "/handbook" },
  { name: "handbook-search", path: "/handbook", search: "blight" },
  { name: "handbook-search-empty", path: "/handbook", search: "zzzz" },
  { name: "plant-tomato-overview", path: "/handbook/tomato", hash: "overview" },
  { name: "plant-tomato-diseases", path: "/handbook/tomato", hash: "diseases" },
  { name: "plant-blueberry-diseases", path: "/handbook/blueberry", hash: "diseases" },
  ...diseasePanels.map((id) => ({
    name: `disease-tomato-ylcv-${id}`,
    path: "/handbook/tomato/tomato-yellow-leaf-curl-virus",
    hash: id,
  })),
  {
    name: "disease-early-blight-treatment",
    path: "/handbook/tomato/early-blight",
    hash: "treatment",
  },
  { name: "disease-orange-hlb-overview", path: "/handbook/orange/huanglongbing", hash: "overview" },
];

const MAX_DOC_RATIO = 1.15;
const problems = [];
const note = (message) => problems.push(message);

async function measure(page, label, viewport) {
  const data = await page.evaluate(() => {
    const lines = (element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      return new Set([...range.getClientRects()].map((rect) => Math.round(rect.top / 4))).size;
    };
    const visible = (element) => {
      const box = element.getBoundingClientRect();
      const panel = element.closest(".panels__panel");
      return box.width > 0 && (!panel || panel.getAttribute("data-active") === "true");
    };
    const panel = document.querySelector('.panels__panel[data-active="true"]');
    return {
      ratio: document.documentElement.scrollHeight / window.innerHeight,
      overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      panelOverflow: panel ? panel.scrollHeight - panel.clientHeight : 0,
      headings: [...document.querySelectorAll("h1, h2")]
        .filter(visible)
        .map((el) => ({ text: el.textContent.trim(), lines: lines(el) })),
    };
  });
  if (data.ratio > MAX_DOC_RATIO)
    note(`${label} ${viewport}: document ${data.ratio.toFixed(2)}x viewport`);
  if (data.overflowX > 0) note(`${label} ${viewport}: horizontal overflow ${data.overflowX}px`);
  if (data.panelOverflow > 1)
    note(`${label} ${viewport}: panel scrolls vertically by ${data.panelOverflow}px`);
  for (const heading of data.headings) {
    if (heading.lines > 2)
      note(`${label} ${viewport}: "${heading.text}" is ${heading.lines} lines`);
  }
}

const browser = await chromium.launch();
for (const viewport of viewports) {
  for (const theme of themes) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      deviceScaleFactor: 1,
    });
    await context.addInitScript((value) => {
      try {
        localStorage.setItem("leafy-theme", value);
        localStorage.setItem("leafy-sfx", "0");
      } catch {}
    }, theme);
    const page = await context.newPage();
    for (const shot of shots) {
      if (only && !only.some((part) => shot.name.includes(part))) continue;
      const query = new URLSearchParams({ nosplash: "1" });
      if (shot.search) query.set("q", shot.search);
      await page.goto(`${base}${shot.path}?${query}${shot.hash ? `#${shot.hash}` : ""}`);
      if (shot.hash) {
        try {
          await page.waitForFunction(
            (id) => document.getElementById(id)?.getAttribute("data-active") === "true",
            shot.hash,
            { timeout: 8000 },
          );
        } catch {
          note(`${shot.name} ${viewport.name}-${theme}: panel #${shot.hash} never became active`);
          continue;
        }
      }
      // Let the three.js scene of the active panel finish fading in (phones show the poster only).
      await page
        .waitForFunction(
          () => {
            const panel = document.querySelector('.panels__panel[data-active="true"]');
            const scene = panel?.querySelector(".lp-scene, .hero__scene");
            return (
              !scene ||
              scene.getAttribute("data-ready") === "true" ||
              getComputedStyle(scene).display === "none"
            );
          },
          undefined,
          { timeout: 9000 },
        )
        .catch(() => note(`${shot.name} ${viewport.name}-${theme}: scene never became ready`));
      await page.waitForTimeout(1200);
      await measure(page, shot.name, `${viewport.name}-${theme}`);
      await page.screenshot({ path: join(outDir, `${shot.name}-${viewport.name}-${theme}.png`) });
    }
    await context.close();
  }
}
await browser.close();

if (problems.length > 0) {
  process.stdout.write(`${problems.length} layout problems\n${problems.join("\n")}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`screenshots in ${outDir}\nAll layout checks passed.\n`);
}
