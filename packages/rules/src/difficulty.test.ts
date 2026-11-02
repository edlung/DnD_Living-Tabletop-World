import { describe, expect, it } from 'vitest';

import { encounterDifficulty } from './difficulty.ts';

/** The SRD's XP budgets (docs/adr/0053-monsters-as-data.md §3) and its own examples. */
describe('an encounter’s difficulty', () => {
  it('sums each character’s budget, and rates the foes’ XP against it', () => {
    // Four level 1 characters: Low 200; one Bugbear Warrior (200 XP) is Low.
    expect(encounterDifficulty([1, 1, 1, 1], 200)).toEqual({
      xp: 200,
      budget: { low: 200, moderate: 300, high: 400 },
      rating: 'low',
    });
    // Five level 3 characters: Moderate 1,125.
    expect(encounterDifficulty([3, 3, 3, 3, 3], 1100).rating).toBe('moderate');
    expect(encounterDifficulty([3, 3, 3, 3, 3], 2001).rating).toBe('beyond');
    // A mixed party sums its own budgets; level 17's High is 11,700.
    expect(encounterDifficulty([17, 15], 0).budget.high).toBe(11_700 + 7_800);
  });
});
