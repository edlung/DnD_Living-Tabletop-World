import type { Ability, CharacterSheet, DamageType, WeaponId } from '@ltw/contracts';

import { WEAPONS } from '../catalog.ts';
import { modifierOf } from '../character-math.ts';
import { classColumn, srdClass } from '../srd/classes.ts';

/**
 * The class features that change numbers (SRD 5.2.1; docs/adr/0056-characters-from-the-srd.md §4):
 * a Rage's damage with Strength attacks, its resistances and its Advantage on Strength checks and
 * saving throws.
 */
export const RAGE_RESISTANCES: readonly DamageType[] = ['bludgeoning', 'piercing', 'slashing'];

/** Rage's damage bonus while it lasts: the Barbarian's Rage Damage column. */
export function rageDamage(sheet: CharacterSheet): number {
  if (!sheet.raging) return 0;
  const level = sheet.classes.find((entry) => entry.classId === 'barbarian')?.level ?? 0;
  const barbarian = srdClass('barbarian');
  return level > 0 && barbarian ? classColumn(barbarian, 'Rage Damage', level) : 0;
}

/** An attack with the weapon uses Strength: a Strength weapon, or a Finesse one where it is best. */
export function usesStrength(sheet: CharacterSheet, weaponId: WeaponId): boolean {
  const weapon = WEAPONS[weaponId];
  return (
    weapon.ability === 'str' ||
    (weapon.ability === 'finesse' && modifierOf(sheet, 'str') >= modifierOf(sheet, 'dex'))
  );
}

/** A Rage's Advantage on Strength checks and Strength saving throws. */
export const rageAdvantage = (sheet: CharacterSheet, ability: Ability): boolean =>
  sheet.raging !== undefined && ability === 'str';

/** The sheet's damage resistances, a Rage's among them. */
export function resistancesOf(sheet: CharacterSheet): readonly DamageType[] {
  const own = sheet.resistances ?? [];
  return sheet.raging ? [...new Set([...own, ...RAGE_RESISTANCES])] : own;
}
