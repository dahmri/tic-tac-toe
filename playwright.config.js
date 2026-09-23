import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;
const CI = !!process.env.CI;
// Set E2E_BASE_URL to test an already running site (CI points it at the
// Docker image); otherwise the production build (dist/) is served locally.
const EXTERNAL_URL = process.env.E2E_BASE_URL;

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 2 : 0,
  reporter: CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: EXTERNAL_URL || `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Let two browser contexts on one machine reach each other over WebRTC
        launchOptions: { args: ['--disable-features=WebRtcHideLocalIpsWithMdns'] },
      },
    },
  ],
  webServer: EXTERNAL_URL
    ? undefined
    : {
        command: `npm run build && node scripts/serve.mjs dist`,
        url: `http://127.0.0.1:${PORT}`,
        env: { PORT: String(PORT) },
        reuseExistingServer: !CI,
      },
});
