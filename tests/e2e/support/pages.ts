import type { Browser, BrowserContext, BrowserContextOptions, Page } from '@playwright/test';

/**
 * Pages of their own contexts for a journey with several people at the table, closed when the
 * test ends. A page left open keeps its live stream, and the server goes on reading every view
 * for it each second: a file of journeys that leaves its pages slows every journey after it in the
 * same worker, until the last ones run out of time.
 */
const opened: BrowserContext[] = [];

export async function freshPage(browser: Browser, options?: BrowserContextOptions): Promise<Page> {
  const context = await browser.newContext(options);
  opened.push(context);
  return context.newPage();
}

/** For `test.afterEach(closePages)`. */
export async function closePages(): Promise<void> {
  await Promise.all(opened.splice(0).map((context) => context.close().catch(() => undefined)));
}
