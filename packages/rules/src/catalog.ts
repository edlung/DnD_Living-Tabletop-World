import type { SpellId } from '@ltw/contracts';

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
  // Reactions (docs/adr/0046-reactions-beyond-counterspell.md §3–4).
  shield: {
    spellId: 'shield',
    level: 1,
    castingTime: 'reaction',
    range: 'self',
    components: ['V', 'S'],
    concentration: false,
    needsVisibleTarget: false,
  },
  'hellish-rebuke': {
    spellId: 'hellish-rebuke',
    level: 1,
    castingTime: 'reaction',
    range: 60,
    components: ['V', 'S'],
    concentration: false,
    needsVisibleTarget: true,
  },
};

/** Shield's bonus to Armor Class until the start of the caster's next turn (ADR 0046 §3). */
export const SHIELD_AC_BONUS = 5;
/** Hellish Rebuke: 2d10 Fire, 1d10 more for each slot level above 1, a Dexterity save for half. */
export const HELLISH_REBUKE_DICE = { count: 2, sides: 10, perLevel: 1 } as const;

/** Uncanny Dodge (Rogue 5): a Reaction halves an attack's damage against the rogue (ADR 0046 §3). */
export const hasUncannyDodge = (sheet: {
  readonly classes: readonly { readonly classId: string; readonly level: number }[];
}): boolean => sheet.classes.some((entry) => entry.classId === 'rogue' && entry.level >= 5);

export const MISTY_STEP_DISTANCE_FT = 30;
export const FIREBALL_RADIUS_FT = 20;
/** Detect Magic senses magic within 30 ft (ADR 0011). */
export const DETECT_MAGIC_RADIUS_FT = 30;

export { WEAPONS, type WeaponDefinition, type WeaponProperty } from './weapons.ts';
