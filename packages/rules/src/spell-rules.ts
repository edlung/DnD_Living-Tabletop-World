import type { SpellId, SrdSpellMechanics } from '@ltw/contracts';

import { SPELLS, type CastingTime, type Component } from './catalog.ts';
import { srdSpell, srdSpellMechanics } from './srd/catalog.ts';

/**
 * A spell's rules for legality and resources (docs/adr/0052-spells-as-data.md §1): the slice's own
 * definition for its nine spells; for any other SRD spell, read from its catalog entry and its
 * mechanics layer. `null`: no spell by that id.
 */
export interface SpellRules {
  readonly spellId: string;
  readonly level: number;
  /** `long`: minutes or hours, which no turn of a fight holds. */
  readonly castingTime: CastingTime | 'long';
  /** Feet (a touch is 5), or `self`; sight, miles and the unlimited are far beyond any board. */
  readonly range: number | 'self';
  readonly components: readonly Component[];
  readonly concentration: boolean;
  /** It may be cast as a ritual: no slot, ten minutes more (docs/adr/0052-spells-as-data.md §6). */
  readonly ritual: boolean;
  readonly needsVisibleTarget: boolean;
  /** Its mechanics layer; `null` for the slice's spells, whose code is their own. */
  readonly mechanics: SrdSpellMechanics | null;
}

/** Beyond any battlefield (40 squares) and any distance a check outside a fight measures. */
export const FAR_FT = 1_000_000;

export const isSliceSpell = (spellId: string): spellId is SpellId => Object.hasOwn(SPELLS, spellId);

export function spellRules(spellId: string): SpellRules | null {
  if (isSliceSpell(spellId)) return { ...SPELLS[spellId], ritual: false, mechanics: null };
  const spell = srdSpell(spellId);
  const mechanics = srdSpellMechanics(spellId);
  if (!spell || !mechanics) return null;
  const { unit } = mechanics.castingTime;
  return {
    spellId,
    level: spell.level,
    castingTime: unit === 'minute' || unit === 'hour' ? 'long' : unit,
    range: rangeFt(mechanics),
    components: [
      ...(spell.components.verbal ? (['V'] as const) : []),
      ...(spell.components.somatic ? (['S'] as const) : []),
      ...(spell.components.material !== null ? (['M'] as const) : []),
    ],
    concentration: spell.concentration,
    ritual: spell.ritual,
    needsVisibleTarget: mechanics.seen,
    mechanics,
  };
}

function rangeFt(mechanics: SrdSpellMechanics): number | 'self' {
  const { kind, amount } = mechanics.range;
  if (kind === 'self') return 'self';
  if (kind === 'touch') return 5;
  if (kind === 'feet') return amount ?? 0;
  if (kind === 'miles') return (amount ?? 1) * 5280;
  return FAR_FT;
}

/** A cantrip's tier at a character level: one die, two at 5, three at 11, four at 17. */
export const cantripTier = (characterLevel: number): number =>
  characterLevel >= 17 ? 4 : characterLevel >= 11 ? 3 : characterLevel >= 5 ? 2 : 1;
