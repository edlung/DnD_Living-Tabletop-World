import type { MarksResponse, MarkView } from '@ltw/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { WorldApi } from '../api/client.ts';
import { marksReader } from './use-marks.ts';

/**
 * The marks a screen reads (docs/adr/0057-encounters-maps-loot.md §5): each screen times a ping's
 * fading by its own clock, from the read that first brought it, whatever the server's clock says.
 */
const markOf = (markId: string, kind: MarkView['kind']): MarkView => ({
  markId,
  kind,
  by: 'dm',
  ...(kind === 'stroke'
    ? {
        squares: [
          { x: 1, y: 1 },
          { x: 2, y: 1 },
        ],
      }
    : { square: { x: 1, y: 1 } }),
  // A server far ahead of this screen: its time plays no part.
  createdAt: '2099-01-01T00:00:00.000Z',
});

function apiReading(reads: readonly (readonly MarkView[])[]): WorldApi {
  let next = 0;
  const get = (): Promise<MarksResponse> => {
    const marks = reads[next] ?? [];
    next += 1;
    return Promise.resolve({ perspective: 'DM', playersMayMark: false, marks });
  };
  return { get } as unknown as WorldApi;
}

describe('the marks a screen reads', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('times a ping from when this screen first saw it, and forgets it once gone', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    const ping = markOf('ping-1', 'ping');
    const stroke = markOf('stroke-1', 'stroke');
    const read = marksReader();
    const api = apiReading([[ping], [ping, stroke], [stroke], [ping]]);
    const signal = new AbortController().signal;

    expect((await read(api, signal)).marks).toEqual([{ ...ping, seenAt: 1_000 }]);
    vi.setSystemTime(3_000);
    // Read again, the ping keeps its first sight; a stroke has none.
    expect((await read(api, signal)).marks).toEqual([{ ...ping, seenAt: 1_000 }, stroke]);
    expect((await read(api, signal)).marks).toEqual([stroke]);
    vi.setSystemTime(9_000);
    // A ping read again after it went is new to this screen.
    expect((await read(api, signal)).marks).toEqual([{ ...ping, seenAt: 9_000 }]);
  });
});
