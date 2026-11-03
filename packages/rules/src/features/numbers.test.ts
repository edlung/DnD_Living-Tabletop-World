import { describe, expect, it } from 'vitest';

import { weaponAttack } from '../character-derived.ts';
import { elowen } from '../testing/elowen.ts';
import { rageAdvantage, rageDamage, resistancesOf, usesStrength } from './numbers.ts';

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
