import { defineConfig } from '@playwright/test';

import base from './playwright.config.ts';

/**
 * The Stage 320 screenshot tour (`pnpm evidence:screens`; tests/e2e/AGENTS.md): the same
 * seeded servers as the journeys, one worker, JPEGs written to reports/evidence/stage-320/.
 * Not part of `pnpm test:e2e`, `pnpm validate` or CI.
 */
export default defineConfig({
  ...base,
  testDir: './tests/evidence',
  testMatch: '*.evidence.ts',
  outputDir: './test-results/evidence',
  fullyParallel: false,
  workers: 1,
  timeout: 240_000,
  use: { ...base.use, trace: 'off', screenshot: 'off' },
});
