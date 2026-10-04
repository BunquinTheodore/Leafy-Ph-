import { defineConfig, devices } from "@playwright/test";

/**
 * Scan journeys (scan, progress, result, history) against the production build and a mock API.
 * Run with: pnpm exec playwright test -c playwright.scan.config.ts
 */
const appPort = process.env.SCAN_APP_PORT ?? "3200";
const apiPort = process.env.SCAN_MOCK_API_PORT ?? "4200";

export default defineConfig({
  testDir: "./tests/e2e/scan",
  // Its own output folder, so a parallel Playwright run elsewhere never wipes these artifacts.
  outputDir: "./test-results-scan",
  // One shared mock API holds state, so tests run one at a time.
  workers: 1,
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  timeout: 60_000,
  reporter: "list",
  use: {
    baseURL: `http://localhost:${appPort}`,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "node tests/mocks/scan-api.mjs",
      url: `http://127.0.0.1:${apiPort}/__mock/state`,
      env: { MOCK_API_PORT: apiPort },
      reuseExistingServer: false,
      timeout: 15_000,
    },
    {
      command: "node scripts/e2e-serve.mjs",
      env: {
        E2E_APP_PORT: appPort,
        API_INTERNAL_URL: `http://127.0.0.1:${apiPort}`,
        APP_ORIGIN: `http://localhost:${appPort}`,
        S3_PUBLIC_ENDPOINT: `http://127.0.0.1:${apiPort}`,
      },
      url: `http://localhost:${appPort}/`,
      reuseExistingServer: false,
      timeout: 360_000,
      stdout: "pipe",
    },
  ],
});
