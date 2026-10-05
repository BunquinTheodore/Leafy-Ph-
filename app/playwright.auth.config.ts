import { defineConfig, devices } from "@playwright/test";

/**
 * Browser tests for the auth screens, public extras and SEO. They run against a production build
 * served by `next start` with a small mock API (tests/e2e-auth/support/mock-api.mjs), so they need
 * neither Postgres nor the real API. The server script builds on first use (see e2e-serve.mjs).
 *
 *   pnpm exec playwright test -c playwright.auth.config.ts
 */
const APP_PORT = Number(process.env.AUTH_E2E_APP_PORT ?? 3147);
const API_PORT = Number(process.env.AUTH_E2E_API_PORT ?? 4147);
const APP_ORIGIN = `http://localhost:${APP_PORT}`;

export default defineConfig({
  testDir: "./tests/e2e-auth",
  // Its own output folder: other Playwright runs in this repo clean the default test-results.
  outputDir: "./test-results-auth",
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  timeout: 45_000,
  reporter: "list",
  use: { baseURL: APP_ORIGIN, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "node tests/e2e-auth/support/mock-api.mjs",
      env: { PORT: String(API_PORT) },
      url: `http://127.0.0.1:${API_PORT}/__test/calls`,
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: "node scripts/e2e-serve.mjs",
      env: {
        E2E_APP_PORT: String(APP_PORT),
        API_INTERNAL_URL: `http://127.0.0.1:${API_PORT}`,
        APP_ORIGIN,
        COOKIE_SECURE: "false",
        COOKIE_PREFIX: "",
        GOOGLE_MOCK: "1",
        NEXT_PUBLIC_AUTH_MOCK: "1",
        NODE_ENV: "production",
      },
      url: `${APP_ORIGIN}/login?nosplash`,
      reuseExistingServer: false,
      timeout: 360_000,
    },
  ],
});
