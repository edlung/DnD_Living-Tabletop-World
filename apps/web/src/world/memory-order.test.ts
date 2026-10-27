import type { RecalledMemory } from '@ltw/contracts';
import { describe, expect, it } from 'vitest';

import { latestFirst } from './memory-order.ts';

/*
 * Stage 360 (AI stand-in pass, DM 41, player 13): the Journal listed remembered events in the
 * recall projection's relevance order, so a Day 2 entry stood between Day 1 entries.
 */
const DAY = 86_400;
const recalled = (memoryId: string, occurredAt: number, score: number): RecalledMemory =>
  ({ memory: { memoryId, occurredAt }, score }) as unknown as RecalledMemory;

describe('remembered events in the Journal', () => {
  it('read latest first whatever their relevance, the same events and nothing else', () => {
    const ranked = [
      recalled('decision-0950', DAY + 9.83 * 3600, 0.9),
      recalled('talk-0930', DAY + 9.5 * 3600, 0.8),
      recalled('day-two-1000', 2 * DAY + 10 * 3600, 0.7),
      recalled('spring', -200 * DAY, 0.6),
      recalled('glance-0935', DAY + 9.58 * 3600, 0.5),
    ];
    expect(latestFirst(ranked).map(({ memory }) => memory.memoryId)).toEqual([
      'day-two-1000',
      'decision-0950',
      'glance-0935',
      'talk-0930',
      'spring',
    ]);
    expect(ranked.map(({ memory }) => memory.memoryId)[0]).toBe('decision-0950');
  });

  it('keeps the projection’s order for events of one moment', () => {
    const ranked = [recalled('a', 100, 0.9), recalled('b', 100, 0.8), recalled('c', 100, 0.7)];
    expect(latestFirst(ranked).map(({ memory }) => memory.memoryId)).toEqual(['a', 'b', 'c']);
  });
});
