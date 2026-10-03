import { describe, expect, it } from 'vitest';

import {
  abilityModifier,
  multiclassCasterLevel,
  proficiencyBonus,
  savingThrowModifier,
  skillModifier,
  spellAttackBonus,
  spellSaveDc,
  spellSlotsFor,
} from './character-math.ts';
import { weaponAttackBonus } from './attacks.ts';
import { elowen } from './testing/elowen.ts';

describe('derived numbers', () => {
  it.each([
    [1, -5],
    [9, -1],
    [10, 0],
    [11, 0],
    [18, 4],
    [30, 10],
  ])('ability score %i has modifier %i', (score, modifier) => {
    expect(abilityModifier(score)).toBe(modifier);
  });

  it.each([
    [1, 2],
    [4, 2],
    [5, 3],
    [9, 4],
    [13, 5],
    [15, 5],
    [17, 6],
  ])('level %i has proficiency bonus +%i', (level, bonus) => {
    expect(proficiencyBonus(level)).toBe(bonus);
  });

  it('computes multiclass spell slots (SRD 5.2.1 table, half Ranger levels rounded up)', () => {
    expect(
      multiclassCasterLevel([
        { classId: 'ranger', level: 7 },
        { classId: 'wizard', level: 8 },
      ]),
    ).toBe(12);
    expect(
      spellSlotsFor([
        { classId: 'ranger', level: 7 },
        { classId: 'wizard', level: 8 },
      ]),
    ).toEqual([4, 3, 3, 3, 2, 1, 0, 0, 0]);
    expect(spellSlotsFor([{ classId: 'ranger', level: 3 }])).toEqual([3, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(spellSlotsFor([{ classId: 'wizard', level: 20 }])).toEqual([4, 3, 3, 3, 3, 2, 2, 1, 1]);
  });
});

describe('Elowen Starwhisper (ADR 0011 fixture)', () => {
  const sheet = elowen();

  it('meets the multiclass prerequisites and has the approved slots', () => {
    expect(sheet.abilities.dex).toBeGreaterThanOrEqual(13);
    expect(sheet.abilities.wis).toBeGreaterThanOrEqual(13);
    expect(sheet.abilities.int).toBeGreaterThanOrEqual(13);
    expect(sheet.spellSlots.max).toEqual(spellSlotsFor(sheet.classes));
    expect([sheet.hitPoints.max, sheet.armorClass, sheet.speedFt]).toEqual([78, 17, 30]);
  });

  it.each([
    ['perception', 12],
    ['investigation', 8],
    ['insight', 7],
    ['survival', 7],
    ['arcana', 8],
    ['stealth', 9],
  ] as const)('has %s +%i', (skill, modifier) => {
    expect(skillModifier(sheet, skill)).toBe(modifier);
  });

  it('casts wizard spells with DC 16 / +8 and Wisdom spells with DC 15 / +7', () => {
    const [ranger, wizard, initiate] = sheet.spellcasting;
    if (!ranger || !wizard || !initiate) throw new Error('fixture changed');
    expect([spellSaveDc(sheet, wizard), spellAttackBonus(sheet, wizard)]).toEqual([16, 8]);
    expect([spellSaveDc(sheet, ranger), spellAttackBonus(sheet, ranger)]).toEqual([15, 7]);
    expect(spellSaveDc(sheet, initiate)).toBe(15);
  });

  it('attacks with the Longbow at +11 (Dex, proficiency, Archery)', () => {
    expect(weaponAttackBonus(sheet, 'longbow')).toBe(11);
  });

  it('adds proficiency only to proficient saving throws', () => {
    expect(savingThrowModifier(sheet, 'dex')).toBe(9);
    expect(savingThrowModifier(sheet, 'con')).toBe(2);
  });
});
