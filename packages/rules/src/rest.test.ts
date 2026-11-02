import { characterSheetSchema, type CharacterSheet } from '@ltw/contracts';
import { describe, expect, it } from 'vitest';

import { deriveCharacter } from './character-derived.ts';
import { hitDice, hitDieRefusal, levelUp, longRest, spendHitDie } from './rest.ts';
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
});

describe('a milestone level', () => {
  it('adds the class die’s fixed hit points and Constitution, and the new spell slots', () => {
    const next = levelUp(elowen, 'wizard');
    if (typeof next === 'string') throw new Error(next);
    expect(next.classes).toContainEqual(expect.objectContaining({ classId: 'wizard', level: 9 }));
    expect(next.hitPoints).toEqual({ max: 84, current: 84 });
    expect(next.spellSlots.max).toEqual([4, 3, 3, 3, 2, 1, 1, 0, 0]);
    expect(deriveCharacter(next).proficiencyBonus).toBe(5);
    expect(characterSheetSchema.safeParse(next).success).toBe(true);
  });

  it('gives a Ranger Extra Attack at level 5', () => {
    const young: CharacterSheet = {
      ...elowen,
      classes: [{ classId: 'ranger', level: 4 }],
      attacksPerAction: 1,
      spellSlots: { max: [3, 0, 0, 0, 0, 0, 0, 0, 0], expended: [1, 0, 0, 0, 0, 0, 0, 0, 0] },
    };
    const next = levelUp(young, 'ranger');
    if (typeof next === 'string') throw new Error(next);
    expect(next.attacksPerAction).toBe(2);
    expect(next.spellSlots).toEqual({
      max: [4, 2, 0, 0, 0, 0, 0, 0, 0],
      expended: [1, 0, 0, 0, 0, 0, 0, 0, 0],
    });
  });

  it('refuses a class the character lacks and a level past 20', () => {
    const ranger: CharacterSheet = { ...elowen, classes: [{ classId: 'ranger', level: 20 }] };
    expect(levelUp(ranger, 'wizard')).toBe('NOT_A_CLASS_OF_THE_CHARACTER');
    expect(levelUp(ranger, 'ranger')).toBe('MAX_LEVEL');
  });
});
