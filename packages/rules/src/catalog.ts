import type { SpellId, WeaponId } from '@ltw/contracts';

/**
 * Slice spells and weapons as data (SRD 5.2.1 mechanics; text not copied).
 * docs/adr/0011-ruleset-srd-5-2.md lists each entry.
 */
export type CastingTime = 'action' | 'bonus' | 'reaction';
export type Component = 'V' | 'S' | 'M';

export interface SpellDefinition {
  readonly spellId: SpellId;
  readonly level: number;
  readonly castingTime: CastingTime;
  /** Feet, or 'self' for spells without a target. */
  readonly range: number | 'self';
  readonly components: readonly Component[];
  readonly concentration: boolean;
  /** Targeted spells require a target the caster can see. */
  readonly needsVisibleTarget: boolean;
}

export const SPELLS: Readonly<Record<SpellId, SpellDefinition>> = {
  'hunters-mark': {
    spellId: 'hunters-mark',
    level: 1,
    castingTime: 'bonus',
    range: 90,
    components: ['V'],
    concentration: true,
    needsVisibleTarget: true,
  },
  'detect-magic': {
    spellId: 'detect-magic',
    level: 1,
    castingTime: 'action',
    range: 'self',
    components: ['V', 'S'],
    concentration: true,
    needsVisibleTarget: false,
  },
  'healing-word': {
    spellId: 'healing-word',
    level: 1,
    castingTime: 'bonus',
    range: 60,
    components: ['V'],
    concentration: false,
    needsVisibleTarget: true,
  },
  'misty-step': {
    spellId: 'misty-step',
    level: 2,
    castingTime: 'bonus',
    range: 'self',
    components: ['V'],
    concentration: false,
    needsVisibleTarget: false,
  },
  fireball: {
    spellId: 'fireball',
    level: 3,
    castingTime: 'action',
    range: 150,
    components: ['V', 'S', 'M'],
    concentration: false,
    needsVisibleTarget: false,
  },
  counterspell: {
    spellId: 'counterspell',
    level: 3,
    castingTime: 'reaction',
    range: 60,
    components: ['S'],
    concentration: false,
    needsVisibleTarget: true,
  },
};

export const MISTY_STEP_DISTANCE_FT = 30;
export const FIREBALL_RADIUS_FT = 20;
/** Detect Magic senses magic within 30 ft (ADR 0011). */
export const DETECT_MAGIC_RADIUS_FT = 30;

export interface WeaponDefinition {
  readonly weaponId: WeaponId;
  readonly ranged: boolean;
  readonly normalRangeFt: number;
  readonly longRangeFt: number;
  readonly damageDice: { readonly count: number; readonly sides: number };
  readonly ability: 'dex' | 'str';
  readonly damageType: string;
  /** Weapon mastery property (SRD 5.2.1); Slow on the Longbow (ADR 0011). */
  readonly mastery: 'slow' | null;
}

export const WEAPONS: Readonly<Record<WeaponId, WeaponDefinition>> = {
  longbow: {
    weaponId: 'longbow',
    ranged: true,
    normalRangeFt: 150,
    longRangeFt: 600,
    damageDice: { count: 1, sides: 8 },
    ability: 'dex',
    damageType: 'piercing',
    mastery: 'slow',
  },
};
