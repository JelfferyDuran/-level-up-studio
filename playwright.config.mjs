// Regression harness config. Chromium only: WebKit is not available in every
// agent environment, so the "iphone-viewport" project emulates iPhone size and
// touch in Chromium. It is NOT a substitute for testing on real iPhone Safari.
import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
    // Day keys are local-time; pin the zone so midnight tests are deterministic.
    timezoneId: 'UTC',
  },
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] } },
    {
      name: 'iphone-viewport',
      use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium', browserName: 'chromium' },
    },
  ],
  webServer: {
    command: `node tests/static-server.mjs`,
    env: { PORT: String(PORT) },
    url: `http://127.0.0.1:${PORT}/index.html`,
    reuseExistingServer: !process.env.CI,
  },
});
