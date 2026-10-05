/**
 * axe accessibility scan of every route, dark and light, desktop and phone, every panel.
 *
 *   node scripts/axe-audit.mjs                 whole site
 *   node scripts/axe-audit.mjs --pages=/login  one route
 *
 * Exit code 1 when any serious or critical violation is found. Needs the real stack on :3000/:8000
 * (see scripts/dev/run-all.ps1). Member routes use a throwaway verified-or-not user that is
 * registered on first use and logged in fresh for each browser context.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import AxeBuilder from "@axe-core/playwright";
import { chromium } from "@playwright/test";

const arg = (name, fallback) => {
  const hit = process.argv.find((value) => value.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

const BASE = arg("base", "http://127.0.0.1:3000");
const API = arg("api", "http://127.0.0.1:8000/api/v1");
const here = dirname(fileURLToPath(import.meta.url));
const USER = {
  email: "perf.audit@leafy.test",
  password: "Perf-Audit-Passw0rd!x",
  first_name: "Perf",
  last_name: "Audit",
};
const BLOCKING = new Set(["serious", "critical"]);
const MAX_PANELS = 12;

const PUBLIC = [
  "/",
  "/handbook",
  "/handbook/tomato",
  "/handbook/tomato/early-blight",
  "/login",
  "/register",
  "/about",
  "/privacy",
  "/terms",
  "/brand",
  "/this-page-does-not-exist",
];
const MEMBER = ["/dashboard", "/scan", "/scans", "/account", "/scans/{scan}"];
const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "phone", width: 390, height: 844 },
];
const THEMES = ["dark", "light"];

async function api(path, body, token, form) {
  const response = await fetch(`${API}${path}`, {
    method: "POST",
    headers: {
      ...(form ? {} : { "content-type": "application/json" }),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: form ?? JSON.stringify(body),
  });
  return { status: response.status, json: await response.json().catch(() => null) };
}

async function login() {
  let result = await api("/auth/login", { email: USER.email, password: USER.password });
  if (result.status !== 200) {
    await api("/auth/register", USER);
    result = await api("/auth/login", { email: USER.email, password: USER.password });
  }
  if (result.status !== 200) throw new Error(`login failed (${result.status})`);
  return result.json.data;
}

async function ensureScan(token) {
  const list = await fetch(`${API}/scans?limit=1`, {
    headers: { authorization: `Bearer ${token}` },
  });
  const body = await list.json();
  const existing = body?.data?.items?.[0]?.id ?? body?.data?.[0]?.id;
  if (existing) return existing;
  const image = readFileSync(join(here, "..", "public", "handbook", "plants", "apple.jpg"));
  const form = new FormData();
  form.append("image", new Blob([image], { type: "image/jpeg" }), "leaf.jpg");
  const created = await api("/scans", null, token, form);
  const id = created.json?.data?.id;
  if (!id) {
    console.warn(`No scan could be created (${created.status}); the scan detail route is skipped.`);
    return null;
  }
  await new Promise((resolve) => setTimeout(resolve, 4000));
  return id;
}

function describe(violation) {
  return {
    id: violation.id,
    impact: violation.impact,
    help: violation.help,
    nodes: violation.nodes.slice(0, 4).map((node) => ({
      target: node.target.join(" "),
      summary: (node.failureSummary ?? "").split("\n").slice(1, 3).join(" | "),
    })),
  };
}

async function scanPage(page) {
  const found = [];
  for (let panel = 0; panel < MAX_PANELS; panel += 1) {
    const result = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"])
      .analyze();
    found.push(...result.violations.map(describe));
    const next = page.getByRole("button", { name: "Next panel" });
    if (!(await next.count()) || (await next.first().isDisabled())) break;
    await next.first().click();
    await page.waitForTimeout(700);
  }
  return found;
}

const browser = await chromium.launch();
const session = await login();
const scanId = await ensureScan(session.access_token);
const routes = (arg("pages", "") ? arg("pages", "").split(",") : [...PUBLIC, ...MEMBER]).filter(
  (route) => scanId || !route.includes("{scan}"),
);

let blocking = 0;
const summary = [];
for (const viewport of VIEWPORTS) {
  for (const theme of THEMES) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      isMobile: viewport.name === "phone",
      hasTouch: viewport.name === "phone",
    });
    const host = new URL(BASE).hostname;
    await context.addCookies([
      { name: "leafy_theme", value: theme, domain: host, path: "/" },
      { name: "leafy_at", value: session.access_token, domain: host, path: "/" },
      { name: "leafy_rt", value: session.refresh_token, domain: host, path: "/" },
    ]);
    await context.addInitScript((value) => {
      try {
        localStorage.setItem("leafy-theme", value);
      } catch {}
    }, theme);
    for (const route of routes) {
      const path = route.replace("{scan}", scanId);
      const page = await context.newPage();
      await page.goto(`${BASE}${path}${path.includes("?") ? "&" : "?"}nosplash`, {
        waitUntil: "networkidle",
      });
      await page.waitForTimeout(600);
      const violations = await scanPage(page);
      const hard = violations.filter((violation) => BLOCKING.has(violation.impact));
      blocking += hard.length;
      summary.push({
        route: path,
        viewport: viewport.name,
        theme,
        hard: hard.length,
        soft: violations.length - hard.length,
      });
      console.log(
        `${hard.length ? "FAIL" : "ok  "} ${viewport.name.padEnd(7)} ${theme.padEnd(5)} ${path} serious/critical=${hard.length} other=${violations.length - hard.length}`,
      );
      for (const violation of violations)
        console.log(
          `      [${violation.impact}] ${violation.id}: ${violation.help}\n        ${violation.nodes.map((node) => `${node.target} :: ${node.summary}`).join("\n        ")}`,
        );
      await page.close();
    }
    await context.close();
  }
}
await browser.close();
console.log(
  `\n${blocking === 0 ? "PASS" : "FAIL"}: ${blocking} serious or critical violations over ${summary.length} scans`,
);
process.exit(blocking === 0 ? 0 : 1);
