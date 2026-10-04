/**
 * Bundle size budget: fails when the JavaScript a route loads up front (gzipped, lazy chunks such
 * as the three.js scenes excluded) or any single chunk grows past the limits in bundle-budget.json.
 *
 *   pnpm build && pnpm budget
 *   NEXT_DIST_DIR=.next-perf pnpm budget       check another build folder
 *
 * First load JS of a route = every chunk listed for the page and for each layout above it in
 * app-build-manifest.json, counted once.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, process.env.NEXT_DIST_DIR ?? ".next");
const budget = JSON.parse(readFileSync(join(root, "bundle-budget.json"), "utf8"));
const manifestPath = join(dist, "app-build-manifest.json");

if (!existsSync(manifestPath)) {
  console.error(`No build found at ${dist}. Run pnpm build first.`);
  process.exit(2);
}

const { pages } = JSON.parse(readFileSync(manifestPath, "utf8"));
const gzipKb = new Map();
const sizeKb = (file) => {
  if (!gzipKb.has(file)) {
    gzipKb.set(file, gzipSync(readFileSync(join(dist, file))).length / 1024);
  }
  return gzipKb.get(file);
};

/** Entries whose chunks a page loads: its own and every layout between the root and the page. */
function entriesFor(route) {
  const segments = route.split("/").slice(0, -1).filter(Boolean);
  const entries = ["/layout"];
  for (let index = 1; index <= segments.length; index += 1) {
    entries.push(`/${segments.slice(0, index).join("/")}/layout`);
  }
  entries.push(route);
  return entries.filter((entry) => pages[entry]);
}

const jsFor = (route) => {
  const files = new Set();
  for (const entry of entriesFor(route)) {
    for (const file of pages[entry]) if (file.endsWith(".js")) files.add(file);
  }
  return [...files];
};

const failures = [];
const rows = [];
for (const route of Object.keys(pages).filter((key) => key.endsWith("/page"))) {
  const files = jsFor(route);
  const total = files.reduce((sum, file) => sum + sizeKb(file), 0);
  const limit = budget.routes[route] ?? budget.defaultRouteKb;
  rows.push({ route, total, limit, chunks: files.length });
  if (total > limit)
    failures.push(`${route}: ${total.toFixed(1)} KB gzip over the ${limit} KB budget`);
}

const allChunks = new Set(
  Object.values(pages)
    .flat()
    .filter((file) => file.endsWith(".js")),
);
for (const file of allChunks) {
  if (sizeKb(file) > budget.maxChunkKb) {
    failures.push(
      `${file}: ${sizeKb(file).toFixed(1)} KB gzip over the ${budget.maxChunkKb} KB chunk limit`,
    );
  }
}

console.log("route".padEnd(46), "gzip KB".padStart(8), "budget".padStart(8), "chunks".padStart(7));
for (const row of rows.sort((a, b) => b.total - a.total)) {
  console.log(
    row.route.padEnd(46),
    row.total.toFixed(1).padStart(8),
    String(row.limit).padStart(8),
    String(row.chunks).padStart(7),
  );
}

if (failures.length > 0) {
  console.error(`\nBundle budget exceeded:\n  ${failures.join("\n  ")}`);
  process.exit(1);
}
console.log("\nBundle budget OK.");
