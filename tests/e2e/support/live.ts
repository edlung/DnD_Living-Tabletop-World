import { expect, type Page, type Request } from '@playwright/test';

import campaigns from '../fixtures/live-campaigns.json' with { type: 'json' };

/** The live session in the browser (docs/adr/0033-live-session.md). */
export const LIVE_CAMPAIGNS = campaigns;

/** The live signal's requests, for the transport cases that cut the stream. */
export const LIVE_URL = /\/api\/campaigns\/[^/]+\/live\?/;

export const liveBadge = (page: Page) => page.locator('header .live-badge');

/** The page follows the world: its live subscription is ready. */
export async function expectLive(page: Page): Promise<void> {
  await expect(liveBadge(page)).toHaveText('Live updates: Live');
}

export const turnBanner = (page: Page) => page.locator('.turn-banner');

/** What the turn banner shows: whose turn it is, or "Your reaction is needed" while asked. */
export const bannerWords = (page: Page) =>
  page.locator('.turn-banner > span:not(.visually-hidden)');

/** What the turn banner announces: whose turn it is, only (a prompt announces itself). */
export const turnAnnounced = (page: Page) => page.locator('.turn-banner [aria-live]');

export const tablePresence = (page: Page) =>
  page.getByRole('region', { name: 'At the table', exact: true });

/** Counts the views a page reads from now on: a page nobody signalled reads nothing. */
export function countWorldReads(page: Page): { count(): number } {
  let reads = 0;
  page.on('request', (request) => {
    const path = new URL(request.url()).pathname;
    if (request.method() === 'GET' && path.startsWith('/api/') && !path.endsWith('/live')) {
      reads += 1;
    }
  });
  return { count: () => reads };
}

/**
 * Quiet: none of the pages has sent a read for `ms`. In a live session every read is followed by
 * one more 1.5 s after it completes, and a change reaches a page a comparison cycle (1 s) later,
 * so on a slow runner a fixed wait from an arbitrary moment can end while reads are still due.
 * Measured from the last read, the same wait ends only once they are done.
 */
export async function readsQuiet(pages: readonly Page[], ms = 3_000): Promise<void> {
  const [first] = pages;
  if (!first) return;
  let last = Date.now();
  const seen = (request: Request) => {
    const path = new URL(request.url()).pathname;
    if (path.startsWith('/api/') && !path.endsWith('/live')) last = Date.now();
  };
  for (const page of pages) page.on('request', seen);
  try {
    for (let rest = ms; rest > 0; rest = last + ms - Date.now()) await first.waitForTimeout(rest);
  } finally {
    for (const page of pages) page.off('request', seen);
  }
}
