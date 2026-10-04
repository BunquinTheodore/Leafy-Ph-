import { defineConfig, devices } from "@playwright/test";

/**
 * Full stack tests: the real Next production build, the real FastAPI, Postgres, an S3 server and
 * Mailpit. Start everything first with `scripts/dev/run-all.ps1 -E2E` (see README). The `stub`
 * project talks to a second stack whose API runs ML_SERVICE=stub.
 */
const MAIN = process.env.FULL_APP_URL ?? "http://127.0.0.1:3000";
const STUB = process.env.FULL_STUB_APP_URL ?? "http://127.0.0.1:3001";
const desktop = { ...devices["Desktop Chrome"] };

export default defineConfig({
  testDir: "./e2e/full",
  outputDir: "./test-results-full",
  fullyParallel: false,
  workers: 2,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: [["list"]],
  use: { trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [
    {
      name: "full",
      testMatch: /.*\.spec\.ts/,
      testIgnore: /ml-unavailable\.spec\.ts/,
      use: { ...desktop, baseURL: MAIN },
    },
    {
      name: "stub",
      testMatch: /ml-unavailable\.spec\.ts/,
      use: { ...desktop, baseURL: STUB },
    },
  ],
});
