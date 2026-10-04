import { defineConfig, devices } from "@playwright/test";

/**
 * Public page suites (design system, landing, handbook). The handbook and the landing read the
 * catalog from the API, so they run against the full stack, not a mock: start it with
 * `scripts/dev/run-all.ps1 -E2E` (or let `pnpm e2e:all` do it). APP_ORIGIN picks another app.
 *
 *   pnpm exec playwright test
 */
export default defineConfig({
  testDir: "./tests/e2e",
  // member/ and scan/ have their own configs and mock backends (see pnpm e2e:all).
  testIgnore: ["**/member/**", "**/scan/**"],
  outputDir: "./test-results-ui",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: { baseURL: process.env.APP_ORIGIN ?? "http://127.0.0.1:3000", trace: "on-first-retry" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
