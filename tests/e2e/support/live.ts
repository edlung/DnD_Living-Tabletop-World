import { expect, type Page } from '@playwright/test';

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
