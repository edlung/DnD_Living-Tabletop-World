import type {
  Browser,
  BrowserContext,
  BrowserContextOptions,
  Page,
  Request,
  TestInfo,
} from '@playwright/test';

/**
 * Pages of their own contexts for a journey with several people at the table, closed when the
 * test ends. A page left open keeps its live stream, and the server goes on reading every view
 * for it each second: a file of journeys that leaves its pages slows every journey after it in the
 * same worker, until the last ones run out of time.
 *
 * A journey that fails says what its pages were at (`closePages`): CI keeps no screenshot, and a
 * journey that waited for a screen leaves nothing else in the job's log.
 */
interface Watched {
  readonly context: BrowserContext;
  readonly page: Page;
  /** Requests sent and not answered yet. */
  readonly waiting: Map<Request, string>;
  readonly failed: string[];
  readonly errors: string[];
}
const opened: Watched[] = [];

/** The production sign-in journeys' origin: nothing a page there shows is ever printed. */
const SIGN_IN_PORT = '4312';

function parts(address: string): { readonly port: string; readonly path: string } {
  try {
    const url = new URL(address);
    return { port: url.port, path: url.pathname };
  } catch {
    return { port: '', path: '?' };
  }
}

export async function freshPage(browser: Browser, options?: BrowserContextOptions): Promise<Page> {
  const context = await browser.newContext(options);
  const page = await context.newPage();
  const watched: Watched = { context, page, waiting: new Map(), failed: [], errors: [] };
  page.on('request', (request) => {
    watched.waiting.set(request, `${request.method()} ${parts(request.url()).path}`);
  });
  page.on('requestfinished', (request) => {
    watched.waiting.delete(request);
  });
  page.on('requestfailed', (request) => {
    const what = watched.waiting.get(request) ?? parts(request.url()).path;
    watched.waiting.delete(request);
    watched.failed.push(`${what} (${request.failure()?.errorText ?? 'failed'})`);
  });
  page.on('console', (message) => {
    if (message.type() === 'error') watched.errors.push(message.text());
  });
  page.on('pageerror', (error) => {
    watched.errors.push(String(error));
  });
  opened.push(watched);
  return page;
}

const short = (text: string, length: number) => text.replace(/\s+/g, ' ').trim().slice(0, length);
const last = (list: readonly string[], count: number) => list.slice(-count).join(' | ');

/** What a page was at when its journey failed, as one line of the job's log. */
async function state(watched: Watched, index: number): Promise<string> {
  const { port, path } = parts(watched.page.url());
  const head = `[journey] page ${String(index + 1)} at ${path}`;
  const counts = `${String(watched.waiting.size)} waiting, ${String(watched.failed.length)} failed`;
  if (port === SIGN_IN_PORT) return `${head}: ${counts}`;
  const shows = await watched.page
    .locator('body')
    .innerText({ timeout: 2_000 })
    .catch(() => '(the page did not answer)');
  return [
    `${head}: ${counts}`,
    `  shows: ${short(shows, 300)}`,
    `  waiting: ${last([...watched.waiting.values()], 8)}`,
    `  failed: ${last(watched.failed, 6)}`,
    `  errors: ${short(last(watched.errors, 4), 400)}`,
  ].join('\n');
}

/** For `test.afterEach(closePages)`: a failed journey first says what its pages were at. */
export async function closePages(
  { browserName }: { readonly browserName: string },
  testInfo: TestInfo,
): Promise<void> {
  const pages = opened.splice(0);
  if (testInfo.status !== testInfo.expectedStatus) {
    const lines = await Promise.all(pages.map((watched, index) => state(watched, index)));
    const title = `[journey] ${testInfo.title} (${browserName}, ${testInfo.status ?? 'unknown'})`;
    process.stdout.write(`${[title, ...lines].join('\n')}\n`);
  }
  await Promise.all(pages.map(({ context }) => context.close().catch(() => undefined)));
}
