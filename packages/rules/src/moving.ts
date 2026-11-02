import type { CreatureSize } from '@ltw/contracts';

import { spanOfSize } from './space.ts';

/**
 * Jumping, falling and height (SRD 5.2.1; docs/adr/0049-space-and-movement.md §6–8): a long jump
 * clears the Strength score in feet after a 10-ft run-up, half standing; a high jump 3 + the
 * Strength modifier in feet, half standing; a fall deals 1d6 Bludgeoning per 10 ft, at most 20d6.
 */
export const RUN_UP_FT = 10;

export function longJumpFt(strength: number, runUp: boolean): number {
  return runUp ? strength : Math.floor(strength / 2);
}

export function highJumpFt(strengthModifier: number, runUp: boolean): number {
  const full = Math.max(0, 3 + strengthModifier);
  return runUp ? full : Math.floor(full / 2);
}

/** The d6s of a fall of `feet`: one per 10 ft, at most 20. */
export const fallDice = (feet: number): number => Math.min(20, Math.floor(Math.max(0, feet) / 10));

/**
 * How tall a creature stands, for who passes over whom (ADR 0049 §6): its space across in feet,
 * a Tiny one 5 ft as any other square's.
 */
export const heightFt = (size: CreatureSize): number => spanOfSize(size) * 5;
