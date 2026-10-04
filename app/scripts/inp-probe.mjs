/**
 * Lab INP probe: drives real pointer and keyboard interactions on a page at 4x CPU slowdown and
 * reports the slowest interaction (the Event Timing API, same source as Chrome's INP).
 *
 *   node scripts/inp-probe.mjs                     the default pages on http://127.0.0.1:3000
 *   node scripts/inp-probe.mjs --pages=/,/handbook
 *
 * Pass --suffix=?nowebgl to take the 3D scenes out and see the DOM and hover code alone.
 * Decorative effects stay ON here (no ?nosplash): this measures the hover code, not the
 * Lighthouse view of the page.
 */
import { chromium, devices } from "@playwright/test";

const arg = (name, fallback) => {
  const hit = process.argv.find((value) => value.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const BASE = arg("base", "http://127.0.0.1:3000");
const pages = arg("pages", "/,/handbook,/handbook/tomato,/login").split(",");
const SUFFIX = arg("suffix", "");
const SETTLE_MS = Number(arg("settle", "9000"));
const SLOWDOWN = 4;
const INP_BUDGET_MS = 200;

const browser = await chromium.launch({ args: ["--disable-blink-features=AutomationControlled"] });
const context = await browser.newContext({
  ...devices["Desktop Chrome"],
  viewport: { width: 1440, height: 900 },
});
let worst = 0;
for (const path of pages) {
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: SLOWDOWN });
  await page.addInitScript(() => {
    window.__events = [];
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries())
        window.__events.push({
          name: entry.name,
          duration: entry.duration,
          inputDelay: entry.processingStart - entry.startTime,
          processing: entry.processingEnd - entry.processingStart,
          presentation: entry.startTime + entry.duration - entry.processingEnd,
          target: entry.target
            ? `${entry.target.tagName.toLowerCase()}.${String(entry.target.className).slice(0, 30)}`
            : "",
        });
    }).observe({ type: "event", durationThreshold: 16, buffered: true });
  });
  await page.goto(`${BASE}${path}${SUFFIX}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(SETTLE_MS);
  for (let step = 0; step < 40; step += 1)
    await page.mouse.move(80 + step * 32, 160 + (step % 7) * 90);
  const buttons = page.locator("a[href], button:not([disabled])");
  const count = Math.min(await buttons.count(), 6);
  for (let index = 0; index < count; index += 1) {
    const target = buttons.nth(index);
    if (await target.isVisible()) await target.hover({ timeout: 2000 }).catch(() => {});
  }
  await page.keyboard.press("Tab");
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(500);
  const events = await page.evaluate(() => window.__events);
  const slowest = events.reduce((max, entry) => Math.max(max, entry.duration), 0);
  worst = Math.max(worst, slowest);
  const slowestEvent = events.reduce(
    (max, entry) => (entry.duration > (max?.duration ?? -1) ? entry : max),
    null,
  );
  const byName = new Map();
  for (const entry of events)
    byName.set(entry.name, Math.max(byName.get(entry.name) ?? 0, entry.duration));
  const top = [...byName]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([name, ms]) => `${name} ${Math.round(ms)}`)
    .join(", ");
  console.log(
    `${path.padEnd(32)} slowest interaction ${Math.round(slowest)} ms over ${events.length} slow events (${top})`,
  );
  if (slowestEvent) {
    console.log(
      `    ${slowestEvent.name} on ${slowestEvent.target}: input delay ${Math.round(slowestEvent.inputDelay)} ms, handlers ${Math.round(slowestEvent.processing)} ms, paint ${Math.round(slowestEvent.presentation)} ms`,
    );
  }
  await page.close();
}
await browser.close();
console.log(
  `\nworst ${Math.round(worst)} ms (budget ${INP_BUDGET_MS} ms at ${SLOWDOWN}x CPU slowdown)`,
);
process.exit(worst <= INP_BUDGET_MS ? 0 : 1);
