/**
 * Serves the production build for a browser test run. Every mock backed Playwright config starts
 * this through its webServer entry and passes its own environment (API_INTERNAL_URL, APP_ORIGIN,
 * the app port in E2E_APP_PORT, ...). All of them share one build in E2E_DIST (default .next-e2e):
 * the app reads those values at request time, so one build serves every suite.
 *
 * It builds only when that folder has no build yet. `pnpm e2e:all` builds once up front, and
 * E2E_SKIP_BUILD=1 refuses to build (the server fails fast instead of waiting minutes).
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const port = process.env.E2E_APP_PORT;
if (!port) {
  console.error("e2e-serve: E2E_APP_PORT is required.");
  process.exit(1);
}
const distDir = process.env.E2E_DIST ?? ".next-e2e";
const nextBin = join(root, "node_modules", "next", "dist", "bin", "next");
const env = {
  ...process.env,
  NEXT_DIST_DIR: distDir,
  COOKIE_SECURE: process.env.COOKIE_SECURE ?? "false",
  NEXT_TELEMETRY_DISABLED: "1",
};

if (!existsSync(join(root, distDir, "BUILD_ID"))) {
  if (process.env.E2E_SKIP_BUILD === "1") {
    console.error(`e2e-serve: no build in ${distDir} and E2E_SKIP_BUILD=1.`);
    process.exit(1);
  }
  const build = spawnSync(process.execPath, [nextBin, "build"], {
    cwd: root,
    env,
    stdio: "inherit",
  });
  if (build.status !== 0) process.exit(build.status ?? 1);
}

const server = spawn(process.execPath, [nextBin, "start", "-p", port], {
  cwd: root,
  env,
  stdio: "inherit",
});
const stop = () => server.kill();
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
server.on("exit", (code) => process.exit(code ?? 0));
