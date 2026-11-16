import type { CastResponse, RollEntry } from '@ltw/contracts';
import { describe, expect, it } from 'vitest';

import {
  AT_ONCE,
  castKey,
  clatter,
  followedCast,
  followsFight,
  freshRolls,
  gatherWaits,
} from './moments.ts';

/**
 * The table screen's moments (docs/adr/0059-atmosphere.md §4–5): another cast fades in, a
 * battlefield's zoom does not; the rolls new to the screen show big, the latest few, never a
 * hidden one.
 */
const cast = (shown: CastResponse['cast'], place?: string | null): CastResponse => ({
  revision: 1,
  cast: shown,
  ...(place === undefined ? {} : { place }),
});

const roll = (rollId: string, hidden = false): RollEntry => ({
  rollId,
  roller: null,
  subject: { kind: 'dice' },
  groups: [],
  hidden,
  at: '2026-11-04T00:00:00.000Z',
});

describe('the screen’s moments', () => {
  it('fade to another cast, not to another zoom of the same', () => {
    expect(castKey(cast({ kind: 'scene', locationId: null }, 'market-square'))).toBe(
      'scene:market-square',
    );
    expect(castKey(cast({ kind: 'scene', locationId: null }, 'golden-stag-inn'))).not.toBe(
      castKey(cast({ kind: 'scene', locationId: null }, 'market-square')),
    );
    expect(castKey(cast({ kind: 'battlefield', zoom: 1, focus: null }))).toBe(
      castKey(cast({ kind: 'battlefield', zoom: 2, focus: 'brann-ironvale' })),
    );
    expect(castKey(cast({ kind: 'title', title: 'Chapter One', subtitle: '' }))).not.toBe(
      castKey(cast({ kind: 'title', title: 'Chapter Two', subtitle: '' })),
    );
  });

  it('show the rolls new to the screen, the latest few, never a hidden one', () => {
    const seen = new Set(['a', 'b']);
    expect(freshRolls([roll('a'), roll('b'), roll('c'), roll('d', true)], seen)).toEqual([
      roll('c'),
    ]);
    const many = Array.from({ length: AT_ONCE + 2 }, (_, index) => roll(`new-${String(index)}`));
    expect(freshRolls(many, seen).map((one) => one.rollId)).toEqual(
      many.slice(-AT_ONCE).map((one) => one.rollId),
    );
  });
  it('show the battlefield while the party fights, only where the cast follows the party', () => {
    const party = cast({ kind: 'scene', locationId: null }, 'market-square');
    expect(followsFight(party)).toBe(true);
    expect(followedCast(party, false)).toBe(party);
    expect(followedCast(party, true).cast).toEqual({ kind: 'battlefield', zoom: 1, focus: null });
    // A place the DM picked, or any other cast, is the DM's word: it stays.
    const picked = cast({ kind: 'scene', locationId: 'golden-stag-inn' }, 'golden-stag-inn');
    expect(followsFight(picked)).toBe(false);
    expect(followedCast(picked, true)).toBe(picked);
    const title = cast({ kind: 'title', title: 'Chapter One', subtitle: '' });
    expect(followedCast(title, true)).toBe(title);
  });

  it('gather whom the table waits for: the same ask once, a few lines, the rest counted', () => {
    const ask = (who: string, what: string) => ({ who, what });
    const waits = [
      ask('Tamsin', 'Perception check'),
      ask('Maren', 'Perception check'),
      ask('Tamsin', 'Dexterity saving throw'),
      ask('Tamsin', 'Perception check'),
      ask('Brann', 'Stealth check'),
      ask('Elowen', 'Stealth check'),
    ];
    const gathered = gatherWaits(waits, 3);
    expect(gathered.lines.map((line) => [line.who, line.what, line.times])).toEqual([
      ['Tamsin', 'Perception check', 2],
      ['Maren', 'Perception check', 1],
      ['Tamsin', 'Dexterity saving throw', 1],
    ]);
    expect(gathered.more).toBe(2);
    expect(gatherWaits(waits, 9).more).toBe(0);
    expect(gatherWaits([], 3)).toEqual({ lines: [], more: 0 });
  });

  it('knock for a throw without a cue: a few impacts, dying away, never a long rattle', () => {
    for (const dice of [0, 1, 2, 8, 40]) {
      const knocks = clatter(dice);
      expect(knocks.length).toBeGreaterThanOrEqual(2);
      expect(knocks.length).toBeLessThanOrEqual(8);
      expect(knocks.at(-1)?.time ?? 1).toBeLessThan(0.7);
      expect(
        knocks.every(
          (knock, index) => index === 0 || knock.speed < (knocks[index - 1]?.speed ?? 0),
        ),
      ).toBe(true);
      expect(knocks.every((knock) => Math.abs(knock.pan) <= 0.5)).toBe(true);
    }
    expect(clatter(1).some((knock) => knock.withDie)).toBe(false);
    expect(clatter(3).some((knock) => knock.withDie)).toBe(true);
  });
});
