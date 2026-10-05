import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  outputDir: './test-results',
  fullyParallel: true,
  forbidOnly: Boolean(process.env['CI']),
  retries: 0,
  workers: 2,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4310',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'node --conditions=@ltw/source apps/server/src/testing/ui-server.ts',
      url: 'http://127.0.0.1:4311/healthz',
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: 'pnpm dev:web --host 127.0.0.1 --port 4310',
      env: { LTW_API_TARGET: 'http://127.0.0.1:4311' },
      url: 'http://127.0.0.1:4310',
      reuseExistingServer: false,
      timeout: 30_000,
    },
  ],
});
