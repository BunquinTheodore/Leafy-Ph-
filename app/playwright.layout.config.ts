import { defineConfig, devices } from "@playwright/test";

/**
 * Wide layout checks. Starts nothing: point BASE_URL at a running production build of the web app
 * (which talks to the preview API) and seed the demo user first (scripts/demo-seed.mjs).
 *
 *   $env:BASE_URL="http://localhost:3200"; pnpm exec playwright test -c playwright.layout.config.ts
 */
export default defineConfig({
  testDir: "./tests/e2e-layout",
  testMatch: "**/*.spec.ts",
  outputDir: "./test-results-layout",
  fullyParallel: true,
  workers: process.env.CI ? 2 : 4,
  retries: 0,
  timeout: 45_000,
  reporter: "list",
  use: {
    baseURL: process.env.BASE_URL ?? "http://localhost:3200",
    ...devices["Desktop Chrome"],
    reducedMotion: "reduce",
  },
  projects: [{ name: "layout" }],
});
