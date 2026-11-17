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
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    // The DM's screen on an iPad in Safari's engine (docs/adr/0043-dm-screen.md §4, Stage 620),
    // and an evening closed and opened there (docs/adr/0071-memory-and-ritual.md §1, Stage 710);
    // the journeys of the later ritual and keepsake stages run there too, each named below.
    // One WebKit journey at a time. These are the suite's heaviest — a DM, players and a TV,
    // three to five pages each. Side by side on a hosted runner, across four runs of 2026-11-16,
    // a different one each time waited fifteen or twenty seconds for a screen that had not caught
    // up (an evening closed, a card in the lobby); one at a time, none has waited so since. That
    // day's red runs had two more causes, answered elsewhere: journeys that left their pages open
    // (tests/e2e/support/journey.ts) and the dev client reloading a page (LTW_VITE_NO_RELOAD below).
    // Same journeys, same assertions, one worker.
    {
      name: 'ipad',
      workers: 1,
      use: { ...devices['iPad Pro 11 landscape'] },
      testMatch:
        /(dm-screen|evening-ritual|stars-and-wishes|next-game|agreement|ritual-checkpoint|campaign-book|campaign-end|comforts|keepsakes-checkpoint|client-errors|pause|turn-hint|party-known|hero-story|envelopes|coming)\.spec\.ts$/,
    },
    // Release 1.0's journeys in Safari's engine too (work-orders/STAGE_699.md, 699b).
    {
      name: 'webkit',
      workers: 1,
      use: { ...devices['Desktop Safari'] },
      testMatch: /release\.spec\.ts$/,
    },
  ],
  webServer: [
    {
      command: 'node --conditions=@ltw/source apps/server/src/testing/ui-server.ts',
      url: 'http://127.0.0.1:4311/healthz',
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: 'pnpm dev:web --host 127.0.0.1 --port 4310',
      // A page that lost its connection to the dev server is not reloaded under its journey:
      // LTW_VITE_NO_RELOAD in apps/web/vite.config.ts.
      env: { LTW_API_TARGET: 'http://127.0.0.1:4311', LTW_VITE_NO_RELOAD: '1' },
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
        LTW_VITE_NO_RELOAD: '1',
      },
      url: 'http://127.0.0.1:4312',
      reuseExistingServer: false,
      timeout: 30_000,
    },
  ],
});
