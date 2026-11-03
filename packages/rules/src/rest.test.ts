import { characterSheetSchema, type CharacterSheet, type ClassId } from '@ltw/contracts';
import { describe, expect, it } from 'vitest';

import { deriveCharacter } from './character-derived.ts';
import { spellSlotsFor } from './character-math.ts';
import {
  CLASS_HIT_DIE,
  DAY_SECONDS,
  attacksFor,
  hitDice,
  hitDieRefusal,
  longRest,
  longRestRefusal,
  spendHitDie,
  wakeAfterShortRest,
} from './rest.ts';
import { elowen as sheetOfElowen } from './testing/elowen.ts';

const elowen = sheetOfElowen();

/** Elowen (Ranger 7 / Wizard 8, Constitution 14) hurt to `current`. */
const hurt = (current: number, extra: Partial<CharacterSheet> = {}): CharacterSheet => ({
  ...elowen,
  ...extra,
  hitPoints: { ...elowen.hitPoints, current },
});
const spent = (sheet: CharacterSheet, sides: 6 | 10, roll: number) => {
  const result = spendHitDie(sheet, sides, roll);
  if (typeof result === 'string') throw new Error(result);
  return result;
};

describe('Hit Point Dice (SRD 5.2.1)', () => {
  it('has one die per class level, largest first, and the sheet stays valid', () => {
    expect(hitDice(elowen)).toEqual([
      { sides: 10, total: 7, spent: 0, left: 7 },
      { sides: 6, total: 8, spent: 0, left: 8 },
    ]);
    expect(deriveCharacter(elowen).hitDice).toEqual([
      { sides: 10, total: 7, left: 7 },
      { sides: 6, total: 8, left: 8 },
    ]);
    expect(characterSheetSchema.safeParse(spent(hurt(40), 10, 5).sheet).success).toBe(true);
  });

  it('heals the roll plus Constitution, at least 1 and never past the maximum', () => {
    expect(spent(hurt(40), 10, 7)).toMatchObject({ healed: 9, modifier: 2 });
    expect(spent(hurt(40), 10, 7).sheet.hitDiceSpent).toEqual({ d10: 1 });
    const weak = hurt(40, { abilities: { ...elowen.abilities, con: 3 } });
    // 1 on the d6 with Constitution −4 still heals 1.
    expect(spent(weak, 6, 1).healed).toBe(1);
    expect(spent(hurt(76), 10, 9).sheet.hitPoints.current).toBe(78);
  });

  it('refuses before any die is rolled: none left, full health, or down', () => {
    const allSpent = hurt(40, { hitDiceSpent: { d10: 7 } });
    expect(hitDieRefusal(allSpent, 10)).toBe('NO_HIT_DICE_LEFT');
    expect(hitDieRefusal(allSpent, 6)).toBeNull();
    expect(hitDieRefusal(hurt(40), 8)).toBe('NO_HIT_DICE_LEFT');
    expect(hitDieRefusal(elowen, 10)).toBe('FULL_HIT_POINTS');
    expect(hitDieRefusal(hurt(0), 10)).toBe('DOWN');
    expect(spendHitDie(hurt(0), 10, 10)).toBe('DOWN');
  });

  it('gives everything back in a long rest, all spent dice included', () => {
    const tired = hurt(0, {
      hitDiceSpent: { d10: 5, d6: 8 },
      conditions: ['unconscious', 'prone'],
      deathSaves: { successes: 2, failures: 1 },
      spellSlots: { max: elowen.spellSlots.max, expended: [4, 3, 1, 0, 0, 0, 0, 0, 0] },
    });
    const rested = longRest(tired);
    expect(rested.hitPoints).toEqual({ max: 78, current: 78 });
    expect(rested.hitDiceSpent).toBeUndefined();
    expect(rested.deathSaves).toBeUndefined();
    expect(rested.conditions).toEqual(['prone']);
    expect(rested.spellSlots.expended.every((used) => used === 0)).toBe(true);
    expect(rested.spellcasting.every((source) => (source.freeCasts?.used ?? 0) === 0)).toBe(true);
    expect(characterSheetSchema.safeParse(rested).success).toBe(true);
  });

  it('heals up to a lowered maximum, wakes the knocked out, and the long rest restores all', () => {
    // docs/adr/0048-hit-points.md §1, §2, §4.
    const drained = { ...elowen, hitPoints: { max: 78, current: 40, reducedBy: 30, temporary: 4 } };
    expect(spent(drained, 10, 10).sheet.hitPoints).toEqual({
      max: 78,
      current: 48,
      reducedBy: 30,
      temporary: 4,
    });
    expect(
      hitDieRefusal({ ...drained, hitPoints: { ...drained.hitPoints, current: 48 } }, 10),
    ).toBe('FULL_HIT_POINTS');
    const out = hurt(1, { knockedOut: true, conditions: ['unconscious', 'prone'] });
    const woken = spent(out, 10, 3).sheet;
    expect(woken.knockedOut).toBeUndefined();
    expect(woken.conditions).toEqual(['prone']);
    const rested = longRest({ ...drained, knockedOut: true, conditions: ['unconscious'] });
    expect(rested.hitPoints).toEqual({ max: 78, current: 78 });
    expect(rested.knockedOut).toBeUndefined();
    expect(characterSheetSchema.safeParse(rested).success).toBe(true);
  });
});

describe('the Fighter, the Rogue and the Cleric (Stage 605)', () => {
  const sheetOf = (classId: ClassId, level: number, con = 14): CharacterSheet => ({
    ...elowen,
    classes: [{ classId, level }],
    abilities: { str: 14, dex: 14, con, int: 10, wis: 14, cha: 10 },
    attacksPerAction: 1,
    spellSlots: { max: [0, 0, 0, 0, 0, 0, 0, 0, 0], expended: [0, 0, 0, 0, 0, 0, 0, 0, 0] },
    spellcasting: [],
  });

  it('gives each its Hit Point Die', () => {
    expect([CLASS_HIT_DIE.fighter, CLASS_HIT_DIE.rogue, CLASS_HIT_DIE.cleric]).toEqual([10, 8, 8]);
    expect(hitDice(sheetOf('cleric', 15))).toEqual([{ sides: 8, total: 15, spent: 0, left: 15 }]);
  });

  it('gives a Fighter two attacks at 5, three at 11 and four at 20', () => {
    expect(attacksFor([{ classId: 'fighter', level: 4 }])).toBe(1);
    expect(attacksFor([{ classId: 'fighter', level: 5 }])).toBe(2);
    expect(attacksFor([{ classId: 'fighter', level: 11 }])).toBe(3);
    expect(attacksFor([{ classId: 'fighter', level: 20 }])).toBe(4);
    expect(attacksFor([{ classId: 'rogue', level: 20 }])).toBe(1);
  });

  it('counts a Cleric as a full caster', () => {
    expect(spellSlotsFor([{ classId: 'cleric', level: 15 }])).toEqual([4, 3, 3, 3, 2, 1, 1, 1, 0]);
    // The ninth-level slot comes at caster level 17 (a level taken: builder/level-up.test.ts).
    expect(spellSlotsFor([{ classId: 'cleric', level: 17 }])).toEqual([4, 3, 3, 3, 2, 1, 1, 1, 1]);
  });
});

describe('rests by the full rules (docs/adr/0050-the-world-around.md §5, §7)', () => {
  const base = elowen;
  it('allows one long rest in 24 hours, counted from the last one’s start', () => {
    expect(longRestRefusal(base, 1000)).toBeNull();
    const rested = longRest(base, 1000);
    expect(rested.lastLongRestAt).toBe(1000);
    expect(longRestRefusal(rested, 1000 + DAY_SECONDS - 1)).toBe('RESTED_TODAY');
    expect(longRestRefusal(rested, 1000 + DAY_SECONDS)).toBeNull();
  });

  it('wakes one knocked out at a short rest’s end, and no one else', () => {
    expect(wakeAfterShortRest(base)).toBeNull();
    const out = { ...base, knockedOut: true as const, conditions: ['unconscious' as const] };
    const awake = wakeAfterShortRest(out);
    expect(awake?.knockedOut).toBeUndefined();
    expect(awake?.conditions).not.toContain('unconscious');
  });
});
