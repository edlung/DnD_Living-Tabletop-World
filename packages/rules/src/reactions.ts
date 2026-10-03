import type { CharacterSheet } from '@ltw/contracts';

import { checkCast, type CastPlan } from './casting.ts';
import type { Component } from './catalog.ts';
import { d20Test, type D20Result } from './d20.ts';
import type { Dice } from './dice.ts';
import { illegal, type Illegal, type TurnState } from './turn.ts';

/**
 * Counterspell (SRD 5.2.1; docs/adr/0011-ruleset-srd-5-2.md). Eligible when
 * the caster has a Reaction and a slot of level 3+, and sees a creature
 * within 60 ft casting a spell with V, S, or M components. The target makes
 * a Constitution save; on a failure its spell has no effect, the action used
 * to cast it is wasted, and its slot is not expended.
 */
export interface CounterspellTrigger {
  readonly casterDistanceFt: number;
  readonly casterVisible: boolean;
  readonly components: readonly Component[];
}

export function checkCounterspell(
  sheet: CharacterSheet,
  turn: TurnState,
  trigger: CounterspellTrigger,
  slotLevel: number,
): CastPlan | Illegal {
  if (trigger.components.length === 0) return illegal('NO_VALID_TRIGGER');
  return checkCast(sheet, turn, {
    spellId: 'counterspell',
    using: { slotLevel },
    target: { distanceFt: trigger.casterDistanceFt, visible: trigger.casterVisible },
  });
}

export interface CounterspellOutcome {
  readonly save: D20Result;
  /** True when the target failed its save: its spell has no effect. */
  readonly countered: boolean;
}

export function resolveCounterspell(
  dice: Dice,
  options: { readonly dc: number; readonly targetConSaveModifier: number },
): CounterspellOutcome {
  const save = d20Test(dice, { modifier: options.targetConSaveModifier, target: options.dc });
  return { save, countered: !save.success };
}
