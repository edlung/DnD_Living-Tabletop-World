import type { CastResponse, RollEntry } from '@ltw/contracts';
import { describe, expect, it } from 'vitest';

import { AT_ONCE, castKey, freshRolls } from './moments.ts';

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
});
