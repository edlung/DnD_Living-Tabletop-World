import { defineConfig, devices } from '@playwright/test';

/**
 * The browser journeys against a running deployment (`tests/deploy/`; run them with
 * `deploy/verify/browser-journey.sh`, which `deploy/verify/ci.sh` calls; docs/adr/0037-deployment.md,
 * "Full product"). Chromium reaches Caddy over HTTPS at PUBLIC_ORIGIN and trusts the deployment's
 * local CA for this run only: it accepts exactly the chains that carry the key of Caddy's local
 * intermediate (`LTW_DEPLOY_SPKI`), and PUBLIC_HOST resolves to this machine. No web server is
 * started here, and nothing of `pnpm test:e2e`, `pnpm validate` or the main CI job runs these. No
 * trace, screenshot or video: the journeys hold real invitation links and session cookies.
 */
const spki = process.env['LTW_DEPLOY_SPKI'] ?? '';
const host = process.env['LTW_DEPLOY_HOST'] ?? 'localhost';

export default defineConfig({
  testDir: './tests/deploy',
  testMatch: '*.deploy.ts',
  outputDir: process.env['LTW_DEPLOY_OUTPUT'] ?? './test-results/deploy',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: true,
  // Hosted runners are several times slower than a workstation.
  timeout: 180_000,
  expect: { timeout: 15_000 },
  // Each step of the journey is printed with its time: the transcript of a run.
  reporter: [['list', { printSteps: true }]],
  use: {
    actionTimeout: 30_000,
    trace: 'off',
    screenshot: 'off',
    video: 'off',
    launchOptions: {
      args: [
        `--ignore-certificate-errors-spki-list=${spki}`,
        `--host-resolver-rules=MAP ${host} 127.0.0.1`,
      ],
    },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
