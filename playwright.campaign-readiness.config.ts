import { defineConfig } from '@playwright/test';

import base from './playwright.config.ts';
import { SIGN_IN_ORIGIN } from './tests/e2e/support/sign-in.ts';

export default defineConfig({
  ...base,
  testDir: './tests/campaign-readiness',
  timeout: 900_000,
  workers: 2,
  use: {
    actionTimeout: 15_000,
    navigationTimeout: 40_000,
    baseURL: SIGN_IN_ORIGIN,
    trace: 'off',
    screenshot: 'off',
  },
  projects: [
    { name: 'phone-chromium', use: { browserName: 'chromium' } },
    {
      name: 'phone-webkit',
      use: {
        browserName: 'webkit',
        launchOptions: process.env['LTW_PHONE_WEBKIT_BINARY']
          ? { executablePath: process.env['LTW_PHONE_WEBKIT_BINARY'] }
          : {},
      },
      workers: 1,
    },
  ],
  webServer: (Array.isArray(base.webServer) ? base.webServer : []).slice(2).map((server) => ({
    ...server,
    timeout: 120_000,
  })),
});
