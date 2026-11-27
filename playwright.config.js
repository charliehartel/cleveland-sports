// Browser tests for the app. They load index.html from a local server and use live ESPN data,
// so a real browser enforces ESPN's cross-origin rules exactly as a phone would.
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: 'tests',
  timeout: 90_000,
  expect: { timeout: 30_000 },
  retries: process.env.CI ? 1 : 0, // live data occasionally hiccups
  workers: 2,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    timezoneId: 'America/Los_Angeles',
    viewport: { width: 1000, height: 900 },
    trace: 'off',
    // Local runs in an environment with a preinstalled browser can point at it.
    launchOptions: process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {},
  },
  webServer: {
    command: 'node tests/serve.js',
    url: 'http://127.0.0.1:4173/',
    reuseExistingServer: !process.env.CI,
  },
});
