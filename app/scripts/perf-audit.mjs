/**
 * Lighthouse audit of the real stack (production build), mobile (throttled) and desktop.
 *
 *   node scripts/perf-audit.mjs                       every page, mobile and desktop, median of 3
 *   node scripts/perf-audit.mjs --form=mobile --runs=1 --pages=/,/login
 *   node scripts/perf-audit.mjs --out=../.dev/perf/baseline.json
 *   node scripts/perf-audit.mjs --splash=on           let the splash and effects run (real visitor view)
 *   node scripts/perf-audit.mjs --splash=on --webgl=on   also allow software WebGL, so the 3D scenes really mount
 *
 * Needs the stack from scripts/dev/run-all.ps1 (web on :3000, API on :8000). Member pages are
 * audited signed in: a throwaway user is registered once and a fresh login (new token family) is
 * made for every run, so refresh token reuse detection is never triggered.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { chromium } from "@playwright/test";
import { launch } from "chrome-launcher";
import lighthouse, { desktopConfig } from "lighthouse";

const arg = (name, fallback) => {
  const hit = process.argv.find((value) => value.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

const BASE = arg("base", "http://127.0.0.1:3000");
const API = arg("api", "http://127.0.0.1:8000/api/v1");
const RUNS = Number(arg("runs", "3"));
const FORMS = arg("form", "mobile,desktop").split(",");
const OUT = arg("out", "");
const SPLASH_ON = arg("splash", "off") === "on";
const THEME = arg("theme", "");
const EXTRA_FLAGS = arg("chrome-flags", "") ? arg("chrome-flags", "").split(" ") : [];
const WEBGL_ON = arg("webgl", "off") === "on";
const LHR_DIR = arg("lhr", "");

const PUBLIC_PAGES = [
  "/",
  "/handbook",
  "/handbook/tomato",
  "/handbook/tomato/early-blight",
  "/login",
  "/register",
];
const MEMBER_PAGES = ["/dashboard", "/scan", "/scans"];
const ALL_PAGES = [...PUBLIC_PAGES, ...MEMBER_PAGES];
const pages = arg("pages", "") ? arg("pages", "").split(",") : ALL_PAGES;

const USER = {
  email: arg("user", "perf.audit@leafy.test"),
  password: arg("password", "Perf-Audit-Passw0rd!x"),
  first_name: "Perf",
  last_name: "Audit",
};

async function api(path, body) {
  const response = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: response.status, json: await response.json() };
}

async function freshSession() {
  let login = await api("/auth/login", { email: USER.email, password: USER.password });
  if (login.status !== 200) {
    await api("/auth/register", USER);
    login = await api("/auth/login", { email: USER.email, password: USER.password });
  }
  if (login.status !== 200) throw new Error(`login failed: ${login.status}`);
  return login.json.data;
}

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};

async function runOnce(url, form, cookie) {
  const chrome = await launch({
    chromePath: chromium.executablePath(),
    chromeFlags: [
      "--headless=new",
      "--no-sandbox",
      ...(WEBGL_ON
        ? ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"]
        : ["--disable-gpu"]),
      ...EXTRA_FLAGS,
      ...(SPLASH_ON ? ["--disable-blink-features=AutomationControlled"] : []),
    ],
  });
  try {
    const flags = {
      port: chrome.port,
      output: "json",
      // The real visitor view: do not announce Lighthouse in the user agent (the page skips effects for it).
      ...(SPLASH_ON ? { emulatedUserAgent: false } : {}),
      logLevel: "error",
      onlyCategories: ["performance", "accessibility", "best-practices", "seo"],
      ...(cookie ? { extraHeaders: { Cookie: cookie } } : {}),
    };
    const config = form === "desktop" ? desktopConfig : undefined;
    const result = await lighthouse(url, flags, config);
    return result.lhr;
  } finally {
    await chrome.kill();
  }
}

function summarize(lhr) {
  const score = (id) => Math.round((lhr.categories[id]?.score ?? 0) * 100);
  const audit = (id) => lhr.audits[id]?.numericValue ?? null;
  const failing = Object.values(lhr.audits)
    .filter(
      (entry) =>
        entry.score !== null &&
        entry.score < 0.9 &&
        entry.scoreDisplayMode !== "informative" &&
        entry.scoreDisplayMode !== "notApplicable",
    )
    .map((entry) => entry.id);
  return {
    performance: score("performance"),
    accessibility: score("accessibility"),
    bestPractices: score("best-practices"),
    seo: score("seo"),
    fcp: audit("first-contentful-paint"),
    lcp: audit("largest-contentful-paint"),
    tbt: audit("total-blocking-time"),
    cls: audit("cumulative-layout-shift"),
    si: audit("speed-index"),
    transferKb: Math.round((audit("total-byte-weight") ?? 0) / 1024),
    runtimeError: lhr.runtimeError?.code ?? null,
    failing,
  };
}

const rows = [];
for (const form of FORMS) {
  for (const path of pages) {
    const member = MEMBER_PAGES.includes(path);
    const runs = [];
    for (let index = 0; index < RUNS; index += 1) {
      let cookie = "";
      if (member) {
        const session = await freshSession();
        cookie = `leafy_at=${session.access_token}; leafy_rt=${session.refresh_token}`;
      }
      const url = `${BASE}${path}${THEME ? `?theme=${THEME}` : ""}`;
      const lhr = await runOnce(url, form, cookie);
      if (LHR_DIR) {
        mkdirSync(LHR_DIR, { recursive: true });
        writeFileSync(
          `${LHR_DIR}/${form}-${path.replace(/[^a-z0-9]+/gi, "_")}-${index}.json`,
          JSON.stringify(lhr),
        );
      }
      runs.push(summarize(lhr));
    }
    const pick = (key) => median(runs.map((run) => run[key] ?? 0));
    const row = {
      form,
      path,
      runs: RUNS,
      performance: pick("performance"),
      accessibility: pick("accessibility"),
      bestPractices: pick("bestPractices"),
      seo: pick("seo"),
      fcp: Math.round(pick("fcp")),
      lcp: Math.round(pick("lcp")),
      tbt: Math.round(pick("tbt")),
      cls: Number(pick("cls").toFixed(3)),
      si: Math.round(pick("si")),
      transferKb: pick("transferKb"),
      failing: [...new Set(runs.flatMap((run) => run.failing))],
      runtimeError: runs.find((run) => run.runtimeError)?.runtimeError ?? null,
    };
    rows.push(row);
    console.log(
      `${form.padEnd(7)} ${path.padEnd(32)} P${row.performance} A${row.accessibility} BP${row.bestPractices} SEO${row.seo} ` +
        `LCP ${row.lcp}ms TBT ${row.tbt}ms CLS ${row.cls} FCP ${row.fcp}ms ${row.transferKb}KB` +
        `${row.runtimeError ? ` ERROR ${row.runtimeError}` : ""}`,
    );
  }
}

if (OUT) {
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(rows, null, 2));
  console.log(`wrote ${OUT}`);
}
