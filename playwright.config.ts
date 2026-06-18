import { defineConfig, devices } from "@playwright/test";

const baseURL =
  process.env.PLAYWRIGHT_BASE_URL ||
  process.env.E2E_BASE_URL ||
  "http://127.0.0.1:3310";
const base = new URL(baseURL);
const shouldStartWebServer =
  process.env.PLAYWRIGHT_SKIP_WEB_SERVER !== "1" &&
  ["127.0.0.1", "localhost"].includes(base.hostname);

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  globalSetup: "./tests/e2e/global-setup.ts",
  reporter: process.env.CI
    ? [["dot"], ["html", { open: "never" }], ["json", { outputFile: "test-results/e2e-results.json" }]]
    : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: shouldStartWebServer
    ? {
        command: `node scripts/e2e/run-with-env.mjs npm run dev -- --hostname ${base.hostname} --port ${base.port || 3310}`,
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      }
    : undefined,
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "mobile-chromium",
      testMatch: /smoke\/.*\.spec\.ts/,
      use: { ...devices["Pixel 7"] },
    },
  ],
});
