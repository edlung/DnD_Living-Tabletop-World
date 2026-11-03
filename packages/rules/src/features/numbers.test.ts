import type { CharacterSheet, ClassId } from '@ltw/contracts';
import { describe, expect, it } from 'vitest';

import { weaponAttack } from '../character-derived.ts';
import { skillModifier } from '../character-math.ts';
import { elowen } from '../testing/elowen.ts';
import {
  criticalFrom,
  dangerSense,
  evasion,
  initiativeAdvantage,
  martialArtsDie,
  rageAdvantage,
  rageDamage,
  reliableTalent,
  resistancesOf,
  sneakAttackDice,
  usesStrength,
  walkingSpeedFt,
} from './numbers.ts';

/** A Rage's numbers (docs/adr/0056-characters-from-the-srd.md §4). */
describe('a Rage', () => {
  const barbarian = elowen({
    classes: [{ classId: 'barbarian', level: 9 }],
    abilities: { str: 16, dex: 12, con: 14, int: 8, wis: 10, cha: 10 },
  });
  const raging = { ...barbarian, raging: { since: 0 } };

  it('adds the Rage Damage column to Strength attacks only while it lasts', () => {
    expect(rageDamage(barbarian)).toBe(0);
    // Level 9: +3.
    expect(rageDamage(raging)).toBe(3);
    expect(usesStrength(raging, 'greataxe')).toBe(true);
    expect(usesStrength(raging, 'longbow')).toBe(false);
    expect(weaponAttack(raging, 'greataxe').damage.bonus).toBe(3 + 3);
    expect(weaponAttack(raging, 'longbow').damage.bonus).toBe(1);
  });

  it('resists bludgeoning, piercing and slashing; Advantage on Strength', () => {
    expect(resistancesOf(barbarian)).toEqual([]);
    expect(resistancesOf(raging)).toEqual(['bludgeoning', 'piercing', 'slashing']);
    expect(rageAdvantage(raging, 'str')).toBe(true);
    expect(rageAdvantage(raging, 'dex')).toBe(false);
  });
});

describe('the features that change numbers', () => {
  const as = (classId: ClassId, level: number, changes: Partial<CharacterSheet> = {}) =>
    elowen({ classes: [{ classId, level }], ...changes });

  it('gives Sneak Attack its d6s and a Champion its wider Critical Hits', () => {
    expect([1, 5, 11, 20].map((level) => sneakAttackDice(as('rogue', level)))).toEqual([
      1, 3, 6, 10,
    ]);
    expect(sneakAttackDice(as('fighter', 5))).toBe(0);
    const champion = (level: number) =>
      elowen({ classes: [{ classId: 'fighter', level, subclass: 'Champion' }] });
    expect([
      criticalFrom(as('fighter', 2)),
      criticalFrom(champion(3)),
      criticalFrom(champion(15)),
    ]).toEqual([20, 19, 18]);
  });

  it('adds Fast Movement and Unarmored Movement to the walking speed', () => {
    const base = { speedFt: 30 };
    expect(walkingSpeedFt(as('barbarian', 5, base))).toBe(40);
    expect(walkingSpeedFt(as('barbarian', 5, { ...base, wornArmor: { weight: 'heavy' } }))).toBe(
      30,
    );
    expect(walkingSpeedFt(as('monk', 6, base))).toBe(45);
    expect(walkingSpeedFt(as('monk', 6, { ...base, wornArmor: { weight: 'light' } }))).toBe(30);
    expect(walkingSpeedFt(as('fighter', 5, base))).toBe(30);
  });

  it('gives Martial Arts its die, and the Advantages, Evasion and Reliable Talent by level', () => {
    expect([1, 5, 11, 17].map((level) => martialArtsDie(as('monk', level)))).toEqual([
      6, 8, 10, 12,
    ]);
    expect(martialArtsDie(as('rogue', 5))).toBeNull();
    expect([dangerSense(as('barbarian', 1)), dangerSense(as('barbarian', 2))]).toEqual([
      false,
      true,
    ]);
    expect(initiativeAdvantage(as('barbarian', 7))).toBe(true);
    expect([evasion(as('rogue', 7)), evasion(as('monk', 6))]).toEqual([true, false]);
    expect(reliableTalent(as('rogue', 7))).toBe(true);
  });

  it('adds half the Proficiency Bonus to a Bard’s skills without proficiency', () => {
    const bard = as('bard', 2, {
      abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
      skills: { proficient: ['performance'], expertise: [] },
    });
    // Proficiency Bonus +2: Athletics +1, Performance +2.
    expect(skillModifier(bard, 'athletics')).toBe(1);
    expect(skillModifier(bard, 'performance')).toBe(2);
    expect(skillModifier({ ...bard, classes: [{ classId: 'bard', level: 1 }] }, 'athletics')).toBe(
      0,
    );
  });
});
