import type { CheckRequestView } from '@ltw/contracts';
import { describe, expect, it } from 'vitest';

import { answersTo } from './actions.tsx';

const request = (change: Partial<CheckRequestView>): CheckRequestView => ({
  requestId: 'r-1',
  groupId: null,
  characterId: 'elowen',
  check: { kind: 'skill', skill: 'investigation' },
  mode: 'normal',
  dc: 14,
  status: 'open',
  at: '2026-11-22T18:00:05.000Z',
  ...change,
});
const option = { check: { kind: 'skill', skill: 'investigation' }, dc: 14 } as const;
const SINCE = '2026-11-22T18:00:00.000Z';

describe('the answers to a roll asked from the book', () => {
  it('are the requests of that check, of those heroes, asked since', () => {
    const requests = [
      request({ requestId: 'mine', status: 'rolled', total: 16, success: true }),
      request({ requestId: 'another-hero', characterId: 'brann' }),
      request({ requestId: 'another-check', check: { kind: 'skill', skill: 'perception' } }),
      request({ requestId: 'earlier', at: '2026-11-22T17:00:00.000Z' }),
      request({ requestId: 'withdrawn', status: 'cancelled' }),
    ];
    expect(answersTo(requests, ['elowen'], option, SINCE).map((r) => r.requestId)).toEqual([
      'mine',
    ]);
    expect(answersTo(requests, ['brann', 'elowen'], option, SINCE).map((r) => r.requestId)).toEqual(
      ['another-hero', 'mine'],
    );
    expect(answersTo(requests, [], option, SINCE)).toEqual([]);
  });
});
