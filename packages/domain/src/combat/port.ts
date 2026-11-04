import type { CombatCommandType, KernelCommandOf } from '@ltw/contracts';

import type { Decision, DecisionContext, Resolution } from '../kernel/decision.ts';

/**
 * Port to the combat engine (docs/adr/0015-combat-engine.md, technical notes).
 * The domain may not import `@ltw/rules`; `@ltw/combat` implements this port
 * and the composition root injects it. Decisions stay pure: all randomness
 * comes from the command's recorded entropy pool through `Dice`.
 */
export interface Dice {
  roll(sides: number): number;
}

/** The combat engine's commands, a journey's among them (docs/adr/0057-…md §10): it rolls saves. */
export type CombatCommand = KernelCommandOf<CombatCommandType | 'Travel'> & {
  readonly resolution?: Resolution;
  readonly encounterId?: string;
};

export interface CombatPort {
  decide(context: DecisionContext, command: CombatCommand, dice: Dice): Decision;
}

/** A uniform 32-bit source; drawn at resolution time and recorded. */
export interface EntropySource {
  next(): number;
}

/** Values drawn per combat command; enough for the largest slice action. */
export const ENTROPY_POOL = 64;
const RANGE = 2 ** 32;

/** Deterministic dice over a recorded pool: face = 1 + ⌊value × sides / 2³²⌋. */
export function poolDice(entropy: readonly number[]): Dice {
  let next = 0;
  return {
    roll(sides) {
      const value = entropy[next];
      if (value === undefined) throw new Error('combat entropy pool exhausted');
      next += 1;
      return 1 + Math.floor((value * sides) / RANGE);
    },
  };
}

/** The pool value that makes `poolDice` roll `face` on a die with `sides` (test support). */
export const entropyFor = (face: number, sides: number): number =>
  Math.ceil(((face - 1) * RANGE) / sides);
