import { defineConfig, devices } from "@playwright/test";

/**
 * Member journeys (dashboard, account, shell) against the production build and a mock API.
 * Run with: pnpm exec playwright test -c playwright.member.config.ts
 */
const appPort = process.env.MEMBER_APP_PORT ?? "3100";
const apiPort = process.env.MOCK_API_PORT ?? "4100";

export default defineConfig({
  testDir: "./tests/e2e/member",
  // One shared mock API holds state, so tests run one at a time.
  workers: 1,
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  timeout: 45_000,
  reporter: "list",
  use: {
    baseURL: `http://localhost:${appPort}`,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "node tests/mocks/member-api.mjs",
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
      },
      url: `http://localhost:${appPort}/`,
      reuseExistingServer: false,
      timeout: 360_000,
      stdout: "pipe",
    },
  ],
});
