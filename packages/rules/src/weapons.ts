import type { AmmunitionKind, WeaponId, WeaponMastery } from '@ltw/contracts';

/**
 * The rules' weapons: the SRD 5.2.1 weapon table, firearms apart (mechanics; text not copied). The
 * longbow was the slice's first (ADR 0011), the next came with the Ravenford weapons of the item
 * catalog (Stage 520), the rest with the weapons' rules (docs/adr/0047-weapons.md): properties,
 * masteries, the Versatile die, Thrown ranges and the ammunition each fires.
 */
export type WeaponProperty =
  | 'finesse'
  | 'light'
  | 'heavy'
  | 'two-handed'
  | 'versatile'
  | 'thrown'
  | 'loading'
  | 'ammunition'
  | 'reach';

export interface WeaponDefinition {
  readonly weaponId: WeaponId;
  /** Simple or Martial (SRD 5.2.1). */
  readonly category: 'simple' | 'martial';
  readonly ranged: boolean;
  /** Reach for a melee weapon (5 ft, 10 ft with Reach); normal and long range for a ranged one. */
  readonly normalRangeFt: number;
  readonly longRangeFt: number;
  readonly damageDice: { readonly count: number; readonly sides: number };
  /** Damage without a die (the Blowgun's 1), before the ability modifier. */
  readonly flatDamage?: number;
  /** Versatile: the die it deals in two hands. */
  readonly versatileSides?: number;
  /** Thrown: its range when thrown (a ranged weapon's Thrown range is its range). */
  readonly thrownRange?: { readonly normalFt: number; readonly longFt: number };
  /** Ammunition: the kind it fires, one piece a shot. */
  readonly ammunition?: AmmunitionKind;
  /** The ability for attack and damage; finesse takes the better of Strength and Dexterity. */
  readonly ability: 'dex' | 'str' | 'finesse';
  readonly damageType: string;
  /** Its mastery property (SRD 5.2.1), used by a character that has mastered the weapon. */
  readonly mastery: WeaponMastery;
  readonly properties: readonly WeaponProperty[];
}

interface Extra {
  readonly versatile?: number;
  readonly thrown?: readonly [number, number];
  readonly reach?: boolean;
}

const melee = (
  weaponId: WeaponId,
  category: WeaponDefinition['category'],
  dice: readonly [number, number],
  damageType: string,
  mastery: WeaponMastery,
  properties: readonly WeaponProperty[],
  extra: Extra = {},
): WeaponDefinition => {
  const reachFt = properties.includes('reach') ? 10 : 5;
  return {
    weaponId,
    category,
    ranged: false,
    normalRangeFt: reachFt,
    longRangeFt: reachFt,
    damageDice: { count: dice[0], sides: dice[1] },
    ...(extra.versatile === undefined ? {} : { versatileSides: extra.versatile }),
    ...(extra.thrown === undefined
      ? {}
      : { thrownRange: { normalFt: extra.thrown[0], longFt: extra.thrown[1] } }),
    ability: properties.includes('finesse') ? 'finesse' : 'str',
    damageType,
    mastery,
    properties,
  };
};

const ranged = (
  weaponId: WeaponId,
  category: WeaponDefinition['category'],
  dice: readonly [number, number],
  range: readonly [number, number],
  damageType: string,
  mastery: WeaponMastery,
  properties: readonly WeaponProperty[],
  ammunition?: AmmunitionKind,
): WeaponDefinition => ({
  weaponId,
  category,
  ranged: true,
  normalRangeFt: range[0],
  longRangeFt: range[1],
  damageDice: { count: dice[0], sides: dice[1] },
  ...(properties.includes('thrown')
    ? { thrownRange: { normalFt: range[0], longFt: range[1] } }
    : {}),
  ...(ammunition === undefined ? {} : { ammunition }),
  ability: properties.includes('finesse') ? 'finesse' : 'dex',
  damageType,
  mastery,
  properties,
});

export const WEAPONS: Readonly<Record<WeaponId, WeaponDefinition>> = {
  // Simple melee weapons.
  club: melee('club', 'simple', [1, 4], 'bludgeoning', 'slow', ['light']),
  dagger: melee('dagger', 'simple', [1, 4], 'piercing', 'nick', ['finesse', 'light', 'thrown'], {
    thrown: [20, 60],
  }),
  greatclub: melee('greatclub', 'simple', [1, 8], 'bludgeoning', 'push', ['two-handed']),
  handaxe: melee('handaxe', 'simple', [1, 6], 'slashing', 'vex', ['light', 'thrown'], {
    thrown: [20, 60],
  }),
  javelin: melee('javelin', 'simple', [1, 6], 'piercing', 'slow', ['thrown'], {
    thrown: [30, 120],
  }),
  'light-hammer': melee(
    'light-hammer',
    'simple',
    [1, 4],
    'bludgeoning',
    'nick',
    ['light', 'thrown'],
    {
      thrown: [20, 60],
    },
  ),
  mace: melee('mace', 'simple', [1, 6], 'bludgeoning', 'sap', []),
  quarterstaff: melee('quarterstaff', 'simple', [1, 6], 'bludgeoning', 'topple', ['versatile'], {
    versatile: 8,
  }),
  sickle: melee('sickle', 'simple', [1, 4], 'slashing', 'nick', ['light']),
  spear: melee('spear', 'simple', [1, 6], 'piercing', 'sap', ['thrown', 'versatile'], {
    thrown: [20, 60],
    versatile: 8,
  }),
  // Simple ranged weapons.
  dart: ranged('dart', 'simple', [1, 4], [20, 60], 'piercing', 'vex', ['finesse', 'thrown']),
  'light-crossbow': ranged(
    'light-crossbow',
    'simple',
    [1, 8],
    [80, 320],
    'piercing',
    'slow',
    ['ammunition', 'loading', 'two-handed'],
    'bolt',
  ),
  shortbow: ranged(
    'shortbow',
    'simple',
    [1, 6],
    [80, 320],
    'piercing',
    'vex',
    ['ammunition', 'two-handed'],
    'arrow',
  ),
  sling: ranged(
    'sling',
    'simple',
    [1, 4],
    [30, 120],
    'bludgeoning',
    'slow',
    ['ammunition'],
    'bullet',
  ),
  // Martial melee weapons.
  battleaxe: melee('battleaxe', 'martial', [1, 8], 'slashing', 'topple', ['versatile'], {
    versatile: 10,
  }),
  flail: melee('flail', 'martial', [1, 8], 'bludgeoning', 'sap', []),
  glaive: melee('glaive', 'martial', [1, 10], 'slashing', 'graze', [
    'heavy',
    'reach',
    'two-handed',
  ]),
  greataxe: melee('greataxe', 'martial', [1, 12], 'slashing', 'cleave', ['heavy', 'two-handed']),
  greatsword: melee('greatsword', 'martial', [2, 6], 'slashing', 'graze', ['heavy', 'two-handed']),
  halberd: melee('halberd', 'martial', [1, 10], 'slashing', 'cleave', [
    'heavy',
    'reach',
    'two-handed',
  ]),
  // Two-Handed unless mounted: mounts come with Stage 640f.
  lance: melee('lance', 'martial', [1, 10], 'piercing', 'topple', ['heavy', 'reach', 'two-handed']),
  longsword: melee('longsword', 'martial', [1, 8], 'slashing', 'sap', ['versatile'], {
    versatile: 10,
  }),
  maul: melee('maul', 'martial', [2, 6], 'bludgeoning', 'topple', ['heavy', 'two-handed']),
  morningstar: melee('morningstar', 'martial', [1, 8], 'piercing', 'sap', []),
  pike: melee('pike', 'martial', [1, 10], 'piercing', 'push', ['heavy', 'reach', 'two-handed']),
  rapier: melee('rapier', 'martial', [1, 8], 'piercing', 'vex', ['finesse']),
  scimitar: melee('scimitar', 'martial', [1, 6], 'slashing', 'nick', ['finesse', 'light']),
  shortsword: melee('shortsword', 'martial', [1, 6], 'piercing', 'vex', ['finesse', 'light']),
  trident: melee('trident', 'martial', [1, 8], 'piercing', 'topple', ['thrown', 'versatile'], {
    thrown: [20, 60],
    versatile: 10,
  }),
  warhammer: melee('warhammer', 'martial', [1, 8], 'bludgeoning', 'push', ['versatile'], {
    versatile: 10,
  }),
  'war-pick': melee('war-pick', 'martial', [1, 8], 'piercing', 'sap', ['versatile'], {
    versatile: 10,
  }),
  whip: melee('whip', 'martial', [1, 4], 'slashing', 'slow', ['finesse', 'reach']),
  // Martial ranged weapons.
  blowgun: {
    ...ranged(
      'blowgun',
      'martial',
      [0, 4],
      [25, 100],
      'piercing',
      'vex',
      ['ammunition', 'loading'],
      'needle',
    ),
    flatDamage: 1,
  },
  'hand-crossbow': ranged(
    'hand-crossbow',
    'martial',
    [1, 6],
    [30, 120],
    'piercing',
    'vex',
    ['ammunition', 'light', 'loading'],
    'bolt',
  ),
  'heavy-crossbow': ranged(
    'heavy-crossbow',
    'martial',
    [1, 10],
    [100, 400],
    'piercing',
    'push',
    ['ammunition', 'heavy', 'loading', 'two-handed'],
    'bolt',
  ),
  longbow: ranged(
    'longbow',
    'martial',
    [1, 8],
    [150, 600],
    'piercing',
    'slow',
    ['ammunition', 'heavy', 'two-handed'],
    'arrow',
  ),
};

/** Whether a weapon has a property. */
export const hasProperty = (weaponId: WeaponId, property: WeaponProperty): boolean =>
  WEAPONS[weaponId].properties.includes(property);
