/**
 * Runs every browser suite against one production build, one after another, and prints a summary.
 *
 *   pnpm e2e:all                 build once, run auth, member, scan, then ui and full on the real stack
 *   pnpm e2e:all -- --only=auth,scan     run just those suites
 *   pnpm e2e:all -- --skip-full  skip the suites that need the real stack (ui, full) (no Postgres, S3, Mailpit, API needed)
 *   E2E_SKIP_BUILD=1 pnpm e2e:all        reuse the last build in .next-e2e
 *
 * The mock backed suites (auth, member, scan) start and stop their own mock servers and app
 * server through Playwright's webServer. The ui suite (landing, handbook, design system) and the
 * full suite need the real stack: this script starts it once with scripts/dev/run-all.ps1 -E2E
 * (Windows), shares it between both and stops it again, leaving Postgres, S3 and
 * Mailpit running if they were already running. An app already answering on :3000 is reused and
 * left alone. The exit code is non-zero if any suite failed.
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import net from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const repo = join(root, "..");
const runAll = join(repo, "scripts", "dev", "run-all.ps1");
const nextBin = join(root, "node_modules", "next", "dist", "bin", "next");
const playwrightCli = join(root, "node_modules", "@playwright", "test", "cli.js");
const DIST = process.env.E2E_DIST ?? ".next-e2e";
const FULL_APP = "http://127.0.0.1:3000";
const POSTGRES_PORT = 5433;
const STACK_WAIT_MS = 180_000;

const SUITES = [
  { name: "auth", config: "playwright.auth.config.ts" },
  { name: "member", config: "playwright.member.config.ts" },
  { name: "scan", config: "playwright.scan.config.ts" },
  { name: "ui", config: "playwright.config.ts", needsStack: true },
  { name: "full", config: "playwright.full.config.ts", needsStack: true },
];

const args = process.argv.slice(2);
const only = args
  .find((arg) => arg.startsWith("--only="))
  ?.slice("--only=".length)
  .split(",");
const selected = SUITES.filter(
  (suite) =>
    (!only || only.includes(suite.name)) && !(args.includes("--skip-full") && suite.needsStack),
);
if (selected.length === 0) {
  console.error(`No suite selected. Known suites: ${SUITES.map((suite) => suite.name).join(", ")}`);
  process.exit(2);
}

const sharedEnv = { ...process.env, NEXT_DIST_DIR: DIST, NEXT_TELEMETRY_DISABLED: "1" };
const log = (message) => console.log(`\n[e2e:all] ${message}`);

const portOpen = (port) =>
  new Promise((resolve) => {
    const socket = net.connect({ port, host: "127.0.0.1" });
    socket.once("connect", () => (socket.destroy(), resolve(true)));
    socket.once("error", () => resolve(false));
  });

async function appAnswers(url) {
  try {
    return (await fetch(url, { signal: AbortSignal.timeout(5000) })).status < 500;
  } catch {
    return false;
  }
}

function build() {
  if (process.env.E2E_SKIP_BUILD === "1" && existsSync(join(root, DIST, "BUILD_ID"))) {
    log(`reusing the build in ${DIST}`);
    return true;
  }
  log(`building the production app into ${DIST}`);
  const result = spawnSync(process.execPath, [nextBin, "build"], {
    cwd: root,
    env: sharedEnv,
    stdio: "inherit",
  });
  return result.status === 0;
}

function powershell(extraArgs, env) {
  return spawnSync(
    "powershell.exe",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", runAll, ...extraArgs],
    { cwd: repo, env, stdio: "inherit" },
  );
}

const stack = { startedByUs: false, infraWasUp: false, ready: false };

async function startStack() {
  if (await appAnswers(`${FULL_APP}/`)) {
    log(`an app already answers on ${FULL_APP}: reusing it`);
    return true;
  }
  if (process.platform !== "win32") {
    log(
      "the ui and full suites need the stack from scripts/dev/run-all.ps1 -E2E (Windows). Start it first.",
    );
    return false;
  }
  stack.infraWasUp = await portOpen(POSTGRES_PORT);
  log("starting the full stack (Postgres, S3, Mailpit, two APIs, two web servers)");
  stack.startedByUs = true;
  const started = powershell(["-E2E", "-SkipBuild"], sharedEnv);
  if (started.status !== 0) return false;
  const deadline = Date.now() + STACK_WAIT_MS;
  while (Date.now() < deadline) {
    if (await appAnswers(`${FULL_APP}/`)) return true;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return false;
}

function stopStack() {
  if (!stack.startedByUs) return;
  log("stopping the full stack");
  powershell(["-Stop", ...(stack.infraWasUp ? ["-KeepInfra"] : [])], sharedEnv);
  stack.startedByUs = false;
}

function runSuite(suite) {
  log(`suite ${suite.name} (${suite.config})`);
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [playwrightCli, "test", "-c", suite.config], {
      cwd: root,
      env: { ...sharedEnv, E2E_DIST: DIST, E2E_SKIP_BUILD: "1" },
      stdio: "inherit",
    });
    child.on("exit", (code) => resolve(code ?? 1));
  });
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    stopStack();
    process.exit(130);
  });
}

const results = [];
try {
  if (!build()) {
    console.error("[e2e:all] build failed");
    process.exit(1);
  }
  for (const suite of selected) {
    if (suite.needsStack && !stack.ready && !(stack.ready = await startStack())) {
      results.push({ name: suite.name, code: 1, note: "stack did not start" });
      continue;
    }
    results.push({ name: suite.name, code: await runSuite(suite) });
  }
} finally {
  stopStack();
}

log("summary");
for (const { name, code, note } of results) {
  console.log(`  ${code === 0 ? "PASS" : "FAIL"}  ${name}${note ? ` (${note})` : ""}`);
}
process.exit(results.every((result) => result.code === 0) ? 0 : 1);
