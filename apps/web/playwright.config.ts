import { defineConfig, devices } from "@playwright/test";

const CI = !!process.env.CI;
const BASE_URL = process.env.BASE_URL || "http://localhost:3000";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  forbidOnly: CI,
  retries: CI ? 2 : 0,
  workers: 1,
  reporter: CI ? [["github"], ["html", { open: "never" }]] : "list",
  timeout: 60_000,
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: CI ? "retain-on-failure" : "off",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: CI
    ? undefined
    : {
        command: "pnpm dev",
        url: BASE_URL,
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
