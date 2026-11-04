import type { ObjectMaterial, ObjectSize, StatBlock } from '@ltw/contracts';

/**
 * Breaking objects (SRD 5.2.1; docs/adr/0048-hit-points.md §5): an object's Armor Class by what it
 * is made of, its hit points by its size, fragile or resilient (each table's average). It has no
 * ability scores: it makes no check and fails every saving throw; poison and psychic damage do
 * nothing to it. Huge and larger objects are broken a Large section at a time, the DM's call.
 */
export const OBJECT_ARMOR_CLASS: Readonly<Record<ObjectMaterial, number>> = {
  cloth: 11,
  glass: 13,
  wood: 15,
  stone: 17,
  iron: 19,
  mithral: 21,
  adamantine: 23,
};

export const OBJECT_HIT_POINTS: Readonly<
  Record<ObjectSize, { readonly fragile: number; readonly resilient: number }>
> = {
  tiny: { fragile: 2, resilient: 5 },
  small: { fragile: 3, resilient: 10 },
  medium: { fragile: 4, resilient: 18 },
  large: { fragile: 5, resilient: 27 },
};

/** Where scores are asked of a thing that has none: 10, so nothing is added or taken. */
const NONE = 10;

/**
 * The stat block of an object: its Armor Class and hit points from the tables, immune to poison
 * and psychic damage, with no speed, attack or spell. `current` keeps the hit points a damaged
 * object had, within its maximum.
 */
export function objectStatBlock(
  material: ObjectMaterial,
  size: ObjectSize,
  resilient: boolean,
  current?: number,
): StatBlock {
  const max = OBJECT_HIT_POINTS[size][resilient ? 'resilient' : 'fragile'];
  return {
    armorClass: OBJECT_ARMOR_CLASS[material],
    hitPoints: { max, current: Math.min(max, current ?? max) },
    immunities: ['poison', 'psychic'],
    speedFt: 0,
    abilities: { str: NONE, dex: NONE, con: NONE, int: NONE, wis: NONE, cha: NONE },
    savingThrows: { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 },
    initiativeBonus: 0,
    attacksPerAction: 1,
    attacks: [],
    spells: [],
    conditions: [],
    object: { material, size, resilient },
  };
}
