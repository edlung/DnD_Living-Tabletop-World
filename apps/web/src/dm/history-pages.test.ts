import type { DmHistoryResponse } from '@ltw/contracts';
import { describe, expect, it, vi } from 'vitest';

import { WorldApi } from '../api/client.ts';
import { GenerationReads, type Resource } from '../api/resource.ts';
import { historyPageKey, historyPageLoader, PageCursor } from './history-pages.ts';

/**
 * The DM history's older pages (docs/adr/0033-live-session.md §7): known by their place, read
 * from their cursor as it is when read, and read again in the background when a new entry moves
 * it, so a shown page keeps its rows (and the pages opened below it) instead of starting over.
 */
function server() {
  const requested: string[] = [];
  const answers: (() => void)[] = [];
  // The client requests by path, as `live.test.ts` reads it.
  const transport = (input: unknown) => {
    const url = new URL(String(input), 'http://table.test');
    requested.push(`${url.pathname}${url.search}`);
    const before = url.searchParams.get('before');
    // Each page names where the next one starts: twenty entries further down.
    const nextBefore = before === null ? 81 : Number(before) - 20;
    return new Promise<Response>((resolve) => {
      answers.push(() => {
        resolve(Response.json({ perspective: 'DM', entries: [], nextBefore }));
      });
    });
  };
  const api = new WorldApi({ campaignId: 'ravenford', token: 'dm' }, 'DM', 'DM', transport);
  return { api, requested, answers };
}

const value = (nextBefore: number): Resource<DmHistoryResponse> => ({
  status: 'ready',
  value: { perspective: 'DM', entries: [], nextBefore },
});

describe('the pages of the DM history', () => {
  it('are known by their place, whatever their cursor', () => {
    expect(historyPageKey(1)).toBe('dm-history:1');
    expect(historyPageKey(2)).not.toBe(historyPageKey(1));
    const newest = new PageCursor(null);
    expect(newest.query()).toBeUndefined();
    expect(newest.follow(null)).toBe(false);
  });

  it('read again from a moved cursor in the background, keeping their rows meanwhile', async () => {
    const { api, requested, answers } = server();
    const cursor = new PageCursor(81);
    const shown: Resource<DmHistoryResponse>[] = [];
    const page = new GenerationReads({
      load: historyPageLoader(api, cursor),
      show: (resource) => shown.push(resource),
      live: false,
    });
    page.start();
    answers[0]?.();
    await vi.waitFor(() => {
      expect(shown).toEqual([value(61)]);
    });

    // An entry was added above: the page above now ends one entry later.
    expect(cursor.follow(82)).toBe(true);
    expect(cursor.follow(82)).toBe(false);
    page.reread();
    expect(requested).toHaveLength(2);
    // Nothing is emptied or shown as loading while the page is read again.
    expect(shown).toEqual([value(61)]);
    answers[1]?.();
    await vi.waitFor(() => {
      expect(shown).toEqual([value(61), value(62)]);
    });
    expect(requested).toEqual([
      '/api/campaigns/ravenford/dm/history?before=81&perspective=DM',
      '/api/campaigns/ravenford/dm/history?before=82&perspective=DM',
    ]);
  });
});
