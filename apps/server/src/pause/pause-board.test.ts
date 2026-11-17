import { PAUSE_AGAIN_MS, PAUSE_ASK_MS, PAUSE_SEEN_MS } from '@ltw/contracts';
import { describe, expect, it } from 'vitest';

import { PauseBoard } from './pause-board.ts';

/** The board of requests for a pause (docs/adr/0073-table-ideas.md §2): memory, and bounded. */
const C = 'ravenford';
const T0 = 1_800_000_000_000;

describe('the board of requests for a pause', () => {
  it('holds one a character, the first asked first', () => {
    const board = new PauseBoard();
    expect(board.ask(C, 'elowen', T0)).toBe(true);
    expect(board.ask(C, 'brann', T0 + 1000)).toBe(true);
    expect(board.list(C, T0 + 2000)).toEqual([
      { characterId: 'elowen', askedAt: T0, seenAt: null },
      { characterId: 'brann', askedAt: T0 + 1000, seenAt: null },
    ]);
    expect(board.list('other-table', T0)).toEqual([]);
  });

  it('takes a second press within the minute as the same request', () => {
    const board = new PauseBoard();
    board.ask(C, 'elowen', T0);
    expect(board.ask(C, 'elowen', T0 + PAUSE_AGAIN_MS - 1)).toBe(false);
    expect(board.list(C, T0 + PAUSE_AGAIN_MS - 1)).toHaveLength(1);
    // Seen meanwhile, it is not asked anew either: the answer stands.
    board.seen(C, 'elowen', T0 + 1000);
    expect(board.ask(C, 'elowen', T0 + 2000)).toBe(false);
    expect(board.list(C, T0 + 2000)[0]?.seenAt).toBe(T0 + 1000);
    // After the minute a new press is a new request.
    expect(board.ask(C, 'elowen', T0 + PAUSE_AGAIN_MS)).toBe(true);
    expect(board.list(C, T0 + PAUSE_AGAIN_MS)).toEqual([
      { characterId: 'elowen', askedAt: T0 + PAUSE_AGAIN_MS, seenAt: null },
    ]);
  });

  it('is gone a moment after the DM has seen it', () => {
    const board = new PauseBoard();
    board.ask(C, 'elowen', T0);
    expect(board.seen(C, 'elowen', T0 + 5000)).toBe(true);
    expect(board.seen(C, 'elowen', T0 + 6000)).toBe(false);
    expect(board.seen(C, 'brann', T0 + 6000)).toBe(false);
    expect(board.list(C, T0 + 5000 + PAUSE_SEEN_MS - 1)).toHaveLength(1);
    expect(board.list(C, T0 + 5000 + PAUSE_SEEN_MS)).toEqual([]);
    expect(board.campaigns).toBe(0);
  });

  it('ages out unanswered', () => {
    const board = new PauseBoard();
    board.ask(C, 'elowen', T0);
    expect(board.list(C, T0 + PAUSE_ASK_MS - 1)).toHaveLength(1);
    expect(board.list(C, T0 + PAUSE_ASK_MS)).toEqual([]);
    expect(board.campaigns).toBe(0);
  });

  it('answers every waiting request when the game is paused, and forgets all when no session is open', () => {
    const board = new PauseBoard();
    board.ask(C, 'elowen', T0);
    board.ask(C, 'brann', T0);
    board.seenAll(C, T0 + 1000);
    expect(board.list(C, T0 + 1000).map((ask) => ask.seenAt)).toEqual([T0 + 1000, T0 + 1000]);
    board.clear(C);
    expect(board.list(C, T0 + 1000)).toEqual([]);
  });

  it('hands out copies', () => {
    const board = new PauseBoard();
    board.ask(C, 'elowen', T0);
    const [ask] = board.list(C, T0);
    (ask as { seenAt: number | null }).seenAt = 1;
    expect(board.list(C, T0)[0]?.seenAt).toBeNull();
  });
});
