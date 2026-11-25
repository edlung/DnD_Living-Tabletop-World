import type { WorldState } from '@ltw/domain';
import { describe, expect, it } from 'vitest';

import { seededEngine } from '../testing/ravenford-app.ts';
import { eveningOf } from './accounts.ts';

/**
 * The last evening played, as the shelf goes on with a book (docs/adr/0075-book-interface.md §20):
 * the real instant it ended, or began while it runs; nothing before the first evening.
 */
describe('the last evening on the shelf', () => {
  it('is the running session, then the ended one, and none before any', async () => {
    const snapshot = await (await seededEngine()).load('ravenford');
    if (!snapshot) throw new Error('no Ravenford');
    const { state } = snapshot;
    const last = [...state.sessions.values()].at(-1);
    if (!last) throw new Error('Ravenford has no session');
    expect(last.playedTo).toBeNull();
    expect(eveningOf(state)).toEqual({ at: last.playedFrom, running: true });

    const ended: WorldState = {
      ...state,
      sessions: new Map([
        ...state.sessions,
        [
          last.sessionId,
          { ...last, endedAt: last.startedAt, playedTo: '2026-11-24T21:30:00.000Z' },
        ],
      ]),
    };
    expect(eveningOf(ended)).toEqual({ at: '2026-11-24T21:30:00.000Z', running: false });

    expect(eveningOf({ ...state, sessions: new Map() })).toBeNull();
  });
});
