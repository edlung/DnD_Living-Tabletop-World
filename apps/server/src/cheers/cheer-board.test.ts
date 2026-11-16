import { CHEER_MS, MAX_CHEERS } from '@ltw/contracts';
import { describe, expect, it } from 'vitest';

import { CheerBoard, type Cheer } from './cheer-board.ts';

/** The cheers a table holds (docs/adr/0072-keepsakes.md §3): a few seconds, a few at once. */
const cheer = (cheerId: string, at: number, overrides: Partial<Cheer> = {}): Cheer => ({
  cheerId,
  mark: 'applause',
  characterId: 'elowen-starwhisper',
  at,
  ...overrides,
});

describe('the board of cheers', () => {
  it('holds a cheer for a few seconds and then nothing of it', () => {
    const board = new CheerBoard();
    expect(board.add('ravenford', cheer('a', 1_000))).toBe(true);
    expect(board.list('ravenford', 1_000 + CHEER_MS - 1).map((one) => one.cheerId)).toEqual(['a']);
    expect(board.list('ravenford', 1_000 + CHEER_MS)).toEqual([]);
    // Nothing is left behind: the campaign itself is forgotten.
    expect(board.campaigns).toBe(0);
  });

  it('takes a retried request as the one cheer it was', () => {
    const board = new CheerBoard();
    expect(board.add('ravenford', cheer('a', 1_000))).toBe(true);
    expect(board.add('ravenford', cheer('a', 1_200, { mark: 'laugh' }))).toBe(false);
    expect(board.list('ravenford', 1_300)).toEqual([cheer('a', 1_000)]);
  });

  it('keeps each campaign’s cheers its own, oldest first', () => {
    const board = new CheerBoard();
    board.add('ravenford', cheer('a', 1_000));
    board.add('hollowmere', cheer('b', 1_100, { characterId: null }));
    board.add('ravenford', cheer('c', 1_200, { mark: 'heart' }));
    expect(board.list('ravenford', 1_300).map((one) => one.cheerId)).toEqual(['a', 'c']);
    expect(board.list('hollowmere', 1_300)).toEqual([cheer('b', 1_100, { characterId: null })]);
    expect(board.list('elsewhere', 1_300)).toEqual([]);
  });

  it('lets the oldest give way past the limit', () => {
    const board = new CheerBoard();
    for (let index = 0; index < MAX_CHEERS + 3; index += 1) {
      board.add('ravenford', cheer(`c${String(index)}`, 1_000 + index));
    }
    const held = board.list('ravenford', 1_100).map((one) => one.cheerId);
    expect(held).toHaveLength(MAX_CHEERS);
    expect(held[0]).toBe('c3');
    expect(held.at(-1)).toBe(`c${String(MAX_CHEERS + 2)}`);
  });

  it('hands out copies: a reader cannot change what is held', () => {
    const board = new CheerBoard();
    board.add('ravenford', cheer('a', 1_000));
    const [read] = board.list('ravenford', 1_100);
    (read as { mark: string }).mark = 'laugh';
    expect(board.list('ravenford', 1_100)[0]?.mark).toBe('applause');
  });
});
