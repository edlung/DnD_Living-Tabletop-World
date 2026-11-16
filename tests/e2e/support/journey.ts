import { test as base } from '@playwright/test';

/**
 * The `test` of a spec that opens contexts of its own (`browser.newContext()`): whatever a journey
 * opened is closed when it ends. Playwright closes only the `page` fixture's context; one a journey
 * opened itself lives on in the worker's browser. Its pages keep their live streams, and the server
 * goes on reading every view for them each second — so each such journey slowed every journey after
 * it in its worker, until the last ones ran out of time (`tests/architecture/journey-pages.test.ts`
 * holds every spec to this, or to `closePages` of `pages.ts`). Contexts opened before the journey
 * (a `beforeAll`) are left as they are.
 */
export const test = base.extend<{ readonly closesItsPages: undefined }>({
  closesItsPages: [
    async ({ browser }, use) => {
      const before = new Set(browser.contexts());
      await use(undefined);
      const opened = browser.contexts().filter((context) => !before.has(context));
      await Promise.all(opened.map((context) => context.close().catch(() => undefined)));
    },
    { auto: true },
  ],
});
