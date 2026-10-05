// Layout audit of every route at 1440x900, 768x1024 and 390x844 in dark and light, against the
// full stack (scripts/dev/run-all.ps1, GOOGLE_MOCK=1 and a web build with NEXT_PUBLIC_AUTH_MOCK=1, ML_SERVICE=dev-fake).
//
//   node scripts/screens-audit.mjs
//   BASE_URL=http://127.0.0.1:3000 OUT=../.dev/screens-audit ONLY=/,/handbook node scripts/screens-audit.mjs
//
// Writes one PNG per route, viewport and theme (plus every sideways panel in the dark theme) and
// prints the problems it measured: headings over two lines, document taller than 1.15 viewports
// (legal pages and the brand guide excepted), sideways overflow, hyphenation, clipped text, panels
// whose content is taller than the panel, and interactive elements covered by something else.
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const base = process.env.BASE_URL ?? "http://127.0.0.1:3000";
const outDir = resolve(here, process.env.OUT ?? "../../.dev/screens-audit");
const only = process.env.ONLY ? process.env.ONLY.split(",") : null;
mkdirSync(outDir, { recursive: true });

const VIEWPORTS = [
  { name: "1440", width: 1440, height: 900 },
  { name: "768", width: 768, height: 1024 },
  { name: "390", width: 390, height: 844 },
];
const THEMES = ["dark", "light"];
const TALL_PAGES = new Set(["/privacy", "/terms", "/brand"]);
const PHOTO = resolve(here, "../../api/app/seeds/plant_photos/tomato.jpg");

const PUBLIC = [
  "/",
  "/handbook",
  "/handbook/tomato",
  "DISEASE",
  "/about",
  "/privacy",
  "/terms",
  "/brand",
  "/login",
  "/register",
  "/this-page-does-not-exist",
];
const MEMBER = ["/dashboard", "/scan", "/scans", "SCAN", "/account"];

const slug = (path) => path.replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "") || "home";

/** Runs in the page: everything the audit reports for the current view. */
function measure({ tallExempt }) {
  const visible = (element) => {
    const style = getComputedStyle(element);
    const box = element.getBoundingClientRect();
    return (
      style.visibility !== "hidden" && style.display !== "none" && box.width > 0 && box.height > 0
    );
  };
  const inActivePanel = (element) => {
    const panel = element.closest(".panels__panel");
    return !panel || panel.getAttribute("data-active") === "true";
  };
  const linesOf = (element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    const tops = new Set(
      [...range.getClientRects()]
        .filter((r) => r.width > 1 && r.height > 1)
        .map((r) => Math.round(r.top / 4)),
    );
    return Math.max(tops.size, 1);
  };
  /** True when a scrolling ancestor hides the element, so it is not really on screen. */
  const inScrollClip = (element) => {
    const box = element.getBoundingClientRect();
    for (let parent = element.parentElement; parent; parent = parent.parentElement) {
      const style = getComputedStyle(parent);
      if (style.overflowY === "visible" && style.overflowX === "visible") continue;
      const clip = parent.getBoundingClientRect();
      if (
        box.bottom > clip.bottom + 1 ||
        box.top < clip.top - 1 ||
        box.right > clip.right + 1 ||
        box.left < clip.left - 1
      )
        return true;
    }
    return false;
  };
  const problems = [];
  for (const heading of document.querySelectorAll("h1, h2")) {
    if (!visible(heading) || !inActivePanel(heading)) continue;
    const lines = linesOf(heading);
    if (lines > 2)
      problems.push(`heading with ${lines} lines: "${heading.textContent.trim().slice(0, 50)}"`);
  }
  const vh = window.innerHeight;
  const docHeight = document.documentElement.scrollHeight;
  if (!tallExempt && docHeight > vh * 1.15)
    problems.push(`document ${docHeight}px tall (${(docHeight / vh).toFixed(2)} viewports)`);
  const overflow = document.documentElement.scrollWidth - document.documentElement.clientWidth;
  if (overflow > 1) problems.push(`sideways overflow ${overflow}px`);
  const hyphenated = [...document.body.querySelectorAll("*")].filter(
    (element) => element.childNodes.length > 0 && getComputedStyle(element).hyphens !== "none",
  );
  if (hyphenated.length)
    problems.push(
      `hyphens not none on ${hyphenated.length} elements, e.g. <${hyphenated[0].tagName.toLowerCase()}>`,
    );
  if ((document.body.textContent ?? "").includes("­")) problems.push("soft hyphen in text");

  for (const element of document.querySelectorAll(
    "h1, h2, h3, p, li, a, button, label, span, td, th",
  )) {
    if (!visible(element) || !inActivePanel(element)) continue;
    if (element.closest("[aria-hidden='true'], .sr-only, .sr-only-focusable, svg, .splash"))
      continue;
    const style = getComputedStyle(element);
    if (style.textOverflow === "ellipsis" || style.webkitLineClamp !== "none") continue;
    if (style.clipPath !== "none" || element.getBoundingClientRect().width <= 1) continue;
    if (element.children.length > 0 && element.tagName !== "A" && element.tagName !== "BUTTON")
      continue;
    const clippedX = element.scrollWidth > element.clientWidth + 2 && style.overflowX !== "visible";
    const clippedY =
      element.scrollHeight > element.clientHeight + 2 && style.overflowY !== "visible";
    if ((clippedX || clippedY) && (element.textContent ?? "").trim()) {
      problems.push(
        `clipped text in <${element.tagName.toLowerCase()}>: "${element.textContent.trim().slice(0, 40)}"`,
      );
    }
  }
  const panel = document.querySelector('.panels__panel[data-active="true"]');
  if (panel && !tallExempt && panel.scrollHeight - panel.clientHeight > 2) {
    problems.push(
      `active panel #${panel.id} content ${panel.scrollHeight - panel.clientHeight}px taller than the panel`,
    );
  }
  for (const element of document.querySelectorAll(
    "a[href], button, input, select, textarea, summary",
  )) {
    if (!visible(element) || !inActivePanel(element) || element.disabled) continue;
    if (
      element.closest(
        "[aria-hidden='true'], .sr-only, .sr-only-focusable, [inert], dialog:not([open]), .splash",
      )
    )
      continue;
    const box = element.getBoundingClientRect();
    if (box.bottom < 0 || box.top > vh || box.right < 0 || box.left > window.innerWidth) continue;
    const x = Math.min(Math.max(box.left + box.width / 2, 1), window.innerWidth - 1);
    const y = Math.min(Math.max(box.top + box.height / 2, 1), vh - 1);
    const top = document.elementFromPoint(x, y);
    if (inScrollClip(element)) continue;
    if (top && top !== element && !element.contains(top) && !top.contains(element)) {
      const name = (element.textContent ?? element.getAttribute("aria-label") ?? "")
        .trim()
        .slice(0, 30);
      problems.push(
        `covered <${element.tagName.toLowerCase()}> "${name}" by <${top.tagName.toLowerCase()} class="${String(top.className).slice(0, 40)}">`,
      );
    }
  }
  const footer = document.querySelector(".site-footer");
  const nav = document.querySelector(".bottom-nav");
  if (footer && nav && getComputedStyle(nav).display !== "none") {
    const f = footer.getBoundingClientRect();
    const n = nav.getBoundingClientRect();
    const scrolled = window.scrollY + vh >= docHeight - 1;
    if (scrolled && f.bottom > n.top + 1 && f.top < n.bottom)
      problems.push("footer overlaps the bottom nav");
  }
  return problems;
}

async function discoverPaths(page) {
  await page.goto(`${base}/handbook/tomato?nosplash`);
  const disease = await page.locator('a[href^="/handbook/tomato/"]').first().getAttribute("href");
  return { disease: disease ?? "/handbook/tomato" };
}

async function createScan(page) {
  const reply = await page.request.post(`${base}/api/scans`, {
    headers: { origin: base },
    multipart: {
      image: {
        name: "tomato.jpg",
        mimeType: "image/jpeg",
        buffer: await (await import("node:fs/promises")).readFile(PHOTO),
      },
    },
  });
  const body = await reply.json();
  const id = body?.data?.id;
  if (!id)
    throw new Error(
      `could not create a scan: ${reply.status()} ${JSON.stringify(body).slice(0, 200)}`,
    );
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const poll = await (await page.request.get(`${base}/api/scans/${id}`)).json();
    if (poll?.data?.status === "completed") return id;
    await page.waitForTimeout(1000);
  }
  throw new Error("the audit scan never completed");
}

const browser = await chromium.launch();
const report = [];
let shots = 0;

async function visit(context, route, viewport, theme, panelsToo) {
  const page = await context.newPage();
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  const path = route.includes("?") ? `${route}&nosplash` : `${route}?nosplash`;
  const response = await page.goto(`${base}${path}`);
  await page.waitForLoadState("networkidle").catch(() => undefined);
  await page.waitForTimeout(500);
  const label = `${slug(route)}-${viewport.name}-${theme}`;
  const tallExempt = TALL_PAGES.has(route.split("?")[0]);
  const actualTheme = await page.evaluate(() =>
    document.documentElement.getAttribute("data-theme"),
  );
  const problems = [];
  if (actualTheme !== theme)
    problems.push(`first paint theme was ${actualTheme}, expected ${theme}`);
  problems.push(...(await page.evaluate(measure, { tallExempt })));
  await page.screenshot({ path: join(outDir, `${label}.png`) });
  shots += 1;
  const status = response?.status() ?? 0;
  report.push({ label: `${label} [${status}]`, problems });

  if (panelsToo) {
    const ids = await page.evaluate(() =>
      [...document.querySelectorAll(".panels__panel")].map((node) => node.id).filter(Boolean),
    );
    for (const id of ids) {
      await page.evaluate((hash) => {
        window.location.hash = hash;
      }, id);
      await page.waitForTimeout(650);
      const panelProblems = await page.evaluate(measure, { tallExempt });
      if (viewport.name !== "768") {
        await page.screenshot({ path: join(outDir, `${label}-panel-${id}.png`) });
        shots += 1;
      }
      report.push({ label: `${label} #${id}`, problems: panelProblems });
    }
  }
  await page.close();
}

async function run(routes, storageState) {
  for (const theme of THEMES) {
    const context = await browser.newContext({ storageState, baseURL: base });
    await context.addCookies([{ name: "leafy_theme", value: theme, url: base }]);
    for (const viewport of VIEWPORTS) {
      for (const route of routes) {
        if (only && !only.includes(route)) continue;
        await visit(context, route, viewport, theme, theme === "dark" || viewport.name !== "768");
      }
    }
    await context.close();
  }
}

const guest = await browser.newContext({ baseURL: base });
const guestPage = await guest.newPage();
const found = await discoverPaths(guestPage);
await guest.close();
await run(
  PUBLIC.map((route) => (route === "DISEASE" ? found.disease : route)),
  undefined,
);

const signIn = await browser.newContext({ baseURL: base });
const signInPage = await signIn.newPage();
await signInPage.goto(`${base}/login?mock_google_email=audit.user@example.com&next=/dashboard`);
await signInPage.getByRole("button", { name: "Continue with Google" }).click();
await signInPage.waitForURL("**/dashboard");
const scanId = await createScan(signInPage);
const storage = await signIn.storageState();
await signIn.close();
await run(
  MEMBER.map((route) => (route === "SCAN" ? `/scans/${scanId}` : route)),
  storage,
);
await browser.close();

let flagged = 0;
for (const { label, problems } of report) {
  const unique = [...new Set(problems)];
  if (unique.length === 0) continue;
  flagged += 1;
  console.log(`\n${label}`);
  for (const problem of unique) console.log(`  - ${problem}`);
}
console.log(
  `\n${report.length} views checked, ${shots} screenshots in ${outDir}, ${flagged} views with problems`,
);
process.exit(flagged === 0 ? 0 : 1);
