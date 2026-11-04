// Browser tests. Locally you can reuse an installed browser instead of downloading one:
//   PW_CHANNEL=msedge npm test        (or chrome)
const { defineConfig, devices } = require("@playwright/test");

const channel = process.env.PW_CHANNEL || undefined;

module.exports = defineConfig({
  testDir: "tests",
  timeout: 30_000,
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: { baseURL: "http://localhost:4173", trace: "retain-on-failure" },
  webServer: { command: "node tools/serve.js 4173", url: "http://localhost:4173", reuseExistingServer: !process.env.CI },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], channel }, grepInvert: /@touch/ },
    { name: "phone", use: { ...devices["Pixel 7"], channel }, grep: /@touch/ },
  ],
});
