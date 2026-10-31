import { randomBytes } from 'node:crypto';

import { defineConfig, devices } from '@playwright/test';

// The invitation-mode journeys' DM links derive from this per-run value
// (apps/server/src/testing/ui-sign-in-links.ts): set once here, inherited by the workers and the
// sign-in server, never written anywhere.
process.env['LTW_UI_SIGN_IN_SEED'] ??= randomBytes(32).toString('hex');

export default defineConfig({
  testDir: './tests/e2e',
  outputDir: './test-results',
  fullyParallel: true,
  forbidOnly: Boolean(process.env['CI']),
  retries: 0,
  // Two locally too: with six (half the cores) on a busy workstation, 28 of 132 journeys timed
  // out. Hosted CI shards the suite across jobs instead (.github/workflows/ci.yml).
  workers: 2,
  // Hosted CI runners are about four times slower than a workstation; multi-page live journeys
  // (a DM and a player across several change cycles) take 28–32 s there. Same assertions.
  timeout: process.env['CI'] ? 90_000 : 30_000,
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
    // Production sign-in (ADR 0036): the invitation-mode server and its own client origin,
    // which is the server's PUBLIC_ORIGIN (tests/e2e/sign-in*.spec.ts).
    {
      command: 'node --conditions=@ltw/source apps/server/src/testing/ui-sign-in-server.ts',
      url: 'http://127.0.0.1:4313/healthz',
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: 'pnpm dev:web --host 127.0.0.1 --port 4312',
      env: {
        LTW_API_TARGET: 'http://127.0.0.1:4313',
        LTW_VITE_CACHE_DIR: 'node_modules/.vite-sign-in',
      },
      url: 'http://127.0.0.1:4312',
      reuseExistingServer: false,
      timeout: 30_000,
    },
  ],
});
