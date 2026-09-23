import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;
const CI = !!process.env.CI;
// Set E2E_BASE_URL to test an already running site (CI points it at the
// Docker Compose stack); otherwise the production build (dist/) is served
// locally by the game server, against a local PostgreSQL and Redis.
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
        command: `npm run build && node server/index.js`,
        url: `http://127.0.0.1:${PORT}/api/health`,
        env: {
          PORT: String(PORT),
          STATIC_DIR: 'dist',
          DATABASE_URL: process.env.E2E_DATABASE_URL || 'postgres://localhost/tictactoe_e2e',
          REDIS_URL: process.env.E2E_REDIS_URL || 'redis://127.0.0.1:6379/14',
          RATE_LIMITS: 'off', // every test signs up a new player
        },
        reuseExistingServer: !CI,
      },
});
