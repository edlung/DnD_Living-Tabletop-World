import type { WeaponId } from '@ltw/contracts';

/**
 * The rules' weapons (SRD 5.2.1 mechanics; text not copied). The longbow is the slice's first
 * (ADR 0011); the rest arrive with the Ravenford weapons of the item catalog (Stage 520). Not
 * modelled: weapon mastery other than the longbow's Slow, two-weapon fighting, ammunition counting,
 * the versatile two-handed die and thrown attacks (a thrown weapon strikes in melee here).
 */
export type WeaponProperty =
  'finesse' | 'light' | 'heavy' | 'two-handed' | 'versatile' | 'thrown' | 'loading' | 'ammunition';

export interface WeaponDefinition {
  readonly weaponId: WeaponId;
  readonly ranged: boolean;
  /** Reach for a melee weapon (5 ft); normal and long range for a ranged one. */
  readonly normalRangeFt: number;
  readonly longRangeFt: number;
  readonly damageDice: { readonly count: number; readonly sides: number };
  /** The ability for attack and damage; finesse takes the better of Strength and Dexterity. */
  readonly ability: 'dex' | 'str' | 'finesse';
  readonly damageType: string;
  /** Weapon mastery property (SRD 5.2.1); Slow on the Longbow (ADR 0011). */
  readonly mastery: 'slow' | null;
  readonly properties: readonly WeaponProperty[];
}

const melee = (
  weaponId: WeaponId,
  sides: number,
  damageType: string,
  ability: 'str' | 'finesse',
  properties: readonly WeaponProperty[],
): WeaponDefinition => ({
  weaponId,
  ranged: false,
  normalRangeFt: 5,
  longRangeFt: 5,
  damageDice: { count: 1, sides },
  ability,
  damageType,
  mastery: null,
  properties,
});

const ranged = (
  weaponId: WeaponId,
  sides: number,
  normal: number,
  long: number,
  properties: readonly WeaponProperty[],
  mastery: 'slow' | null = null,
): WeaponDefinition => ({
  weaponId,
  ranged: true,
  normalRangeFt: normal,
  longRangeFt: long,
  damageDice: { count: 1, sides },
  ability: 'dex',
  damageType: 'piercing',
  mastery,
  properties,
});

export const WEAPONS: Readonly<Record<WeaponId, WeaponDefinition>> = {
  longbow: ranged('longbow', 8, 150, 600, ['ammunition', 'heavy', 'two-handed'], 'slow'),
  shortbow: ranged('shortbow', 6, 80, 320, ['ammunition', 'two-handed']),
  'light-crossbow': ranged('light-crossbow', 8, 80, 320, ['ammunition', 'loading', 'two-handed']),
  dagger: melee('dagger', 4, 'piercing', 'finesse', ['finesse', 'light', 'thrown']),
  shortsword: melee('shortsword', 6, 'piercing', 'finesse', ['finesse', 'light']),
  longsword: melee('longsword', 8, 'slashing', 'str', ['versatile']),
  rapier: melee('rapier', 8, 'piercing', 'finesse', ['finesse']),
  scimitar: melee('scimitar', 6, 'slashing', 'finesse', ['finesse', 'light']),
  handaxe: melee('handaxe', 6, 'slashing', 'str', ['light', 'thrown']),
  battleaxe: melee('battleaxe', 8, 'slashing', 'str', ['versatile']),
  mace: melee('mace', 6, 'bludgeoning', 'str', []),
  warhammer: melee('warhammer', 8, 'bludgeoning', 'str', ['versatile']),
  quarterstaff: melee('quarterstaff', 6, 'bludgeoning', 'str', ['versatile']),
  spear: melee('spear', 6, 'piercing', 'str', ['thrown', 'versatile']),
};
