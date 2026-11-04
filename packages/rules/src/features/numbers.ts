import type {
  Ability,
  AppliedFeature,
  CharacterSheet,
  ClassId,
  DamageType,
  WeaponId,
} from '@ltw/contracts';

import { armorSlowFt } from '../armor.ts';
import { WEAPONS } from '../catalog.ts';
import { modifierOf, proficiencyBonus, totalLevel } from '../character-math.ts';
import { classColumn, srdClass } from '../srd/classes.ts';

/**
 * The class features that change numbers (SRD 5.2.1; docs/adr/0056-characters-from-the-srd.md §4):
 * a Rage's damage with Strength attacks, its resistances and its Advantage on Strength checks and
 * saving throws; Sneak Attack's dice, the Champion's wider Critical Hits, the speed Fast Movement
 * and Unarmored Movement add, Martial Arts' die, and the Advantage of Danger Sense, Feral Instinct
 * and Remarkable Athlete; Evasion and Reliable Talent. Jack of All Trades is in `skillModifier`.
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

const levelIn = (sheet: CharacterSheet, classId: ClassId): number =>
  sheet.classes.find((entry) => entry.classId === classId)?.level ?? 0;
/** A subclass's feature from its level: the class entry names its subclass. */
const subclassAt = (sheet: CharacterSheet, classId: ClassId, level: number): boolean =>
  sheet.classes.some(
    (entry) => entry.classId === classId && entry.subclass !== undefined && entry.level >= level,
  );

/** Sneak Attack's d6s: the Rogue's Sneak Attack column; none without Rogue levels. */
export function sneakAttackDice(sheet: CharacterSheet): number {
  const level = levelIn(sheet, 'rogue');
  const rogue = srdClass('rogue');
  return level > 0 && rogue ? classColumn(rogue, 'Sneak Attack', level) : 0;
}

/** The lowest d20 that is a Critical Hit: 19 with Improved Critical, 18 with Superior Critical. */
export function criticalFrom(sheet: CharacterSheet): number {
  return subclassAt(sheet, 'fighter', 15) ? 18 : subclassAt(sheet, 'fighter', 3) ? 19 : 20;
}

/**
 * Walking speed before conditions: the sheet's, less heavy armor worn without the Strength for it,
 * plus Fast Movement (a Barbarian from 5, out of heavy armor) and Unarmored Movement (a Monk from 2,
 * in no armor).
 */
export function walkingSpeedFt(sheet: CharacterSheet): number {
  const fast = levelIn(sheet, 'barbarian') >= 5 && sheet.wornArmor?.weight !== 'heavy' ? 10 : 0;
  const monk = srdClass('monk');
  const unarmored =
    sheet.wornArmor === undefined && monk
      ? classColumn(monk, 'Unarmored Movement', levelIn(sheet, 'monk'))
      : 0;
  return Math.max(0, sheet.speedFt - armorSlowFt(sheet)) + fast + unarmored;
}

/** Martial Arts' die for an Unarmed Strike or a Monk weapon: the Monk's column; null without one. */
export function martialArtsDie(sheet: CharacterSheet): number | null {
  const level = levelIn(sheet, 'monk');
  const monk = srdClass('monk');
  const index = monk?.columns.indexOf('Martial Arts') ?? -1;
  const value = index < 0 || level < 1 ? undefined : monk?.levels[level - 1]?.values[index];
  const sides = Number(/d(\d+)/.exec(value ?? '')?.[1] ?? 0);
  return sides > 0 ? sides : null;
}

/** Advantage on Dexterity saves: Danger Sense, a Barbarian's from 2. */
export const dangerSense = (sheet: CharacterSheet): boolean => levelIn(sheet, 'barbarian') >= 2;

/** Advantage on Initiative: Feral Instinct (a Barbarian from 7) or Remarkable Athlete (a Champion). */
export const initiativeAdvantage = (sheet: CharacterSheet): boolean =>
  levelIn(sheet, 'barbarian') >= 7 || subclassAt(sheet, 'fighter', 3);

/** Advantage on Strength (Athletics) checks: Remarkable Athlete, a Champion's from 3. */
export const athleticsAdvantage = (sheet: CharacterSheet): boolean =>
  subclassAt(sheet, 'fighter', 3);

/** Evasion: a Dexterity save against an area's damage takes none on a success, half on a failure. */
export const evasion = (sheet: CharacterSheet): boolean =>
  levelIn(sheet, 'rogue') >= 7 || levelIn(sheet, 'monk') >= 7;

/** Reliable Talent: a d20 of 9 or lower is a 10 for a check with a skill it is proficient in. */
export const reliableTalent = (sheet: CharacterSheet): boolean => levelIn(sheet, 'rogue') >= 7;

/** The class features the World Engine applies on its own, as the sheet shows them. */
export function appliedFeatures(sheet: CharacterSheet): AppliedFeature[] {
  const applied: AppliedFeature[] = [];
  const add = (feature: AppliedFeature['feature'], when: boolean, amount?: number) => {
    if (when) applied.push(amount === undefined ? { feature } : { feature, amount });
  };
  const sneak = sneakAttackDice(sheet);
  add('sneak-attack', sneak > 0, sneak);
  const critical = criticalFrom(sheet);
  add('improved-critical', critical === 19);
  add('superior-critical', critical === 18);
  const art = martialArtsDie(sheet);
  add('martial-arts', art !== null, art ?? undefined);
  add('unarmored-defense', levelIn(sheet, 'barbarian') > 0 || levelIn(sheet, 'monk') > 0);
  add('fast-movement', levelIn(sheet, 'barbarian') >= 5, 10);
  const monk = srdClass('monk');
  const unarmored = monk ? classColumn(monk, 'Unarmored Movement', levelIn(sheet, 'monk')) : 0;
  add('unarmored-movement', unarmored > 0, unarmored);
  add('danger-sense', dangerSense(sheet));
  add('feral-instinct', levelIn(sheet, 'barbarian') >= 7);
  add('remarkable-athlete', athleticsAdvantage(sheet));
  add('evasion', evasion(sheet));
  add('reliable-talent', reliableTalent(sheet));
  add(
    'jack-of-all-trades',
    levelIn(sheet, 'bard') >= 2,
    Math.floor(proficiencyBonus(totalLevel(sheet)) / 2),
  );
  return applied;
}
