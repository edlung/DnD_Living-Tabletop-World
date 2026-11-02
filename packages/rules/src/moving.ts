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

/**
 * Under water (SRD 5.2.1; docs/adr/0049-space-and-movement.md §11): a melee weapon attack by a
 * creature without a Swim Speed has Disadvantage unless the weapon stabs (dagger, javelin,
 * shortsword, spear, trident); a ranged one reaches no farther than its normal range and has
 * Disadvantage there unless it is a crossbow, a net or thrown like a javelin.
 */
const UNDERWATER_MELEE: ReadonlySet<string> = new Set([
  'dagger',
  'javelin',
  'shortsword',
  'spear',
  'trident',
]);
const UNDERWATER_RANGED: ReadonlySet<string> = new Set([
  'light-crossbow',
  'hand-crossbow',
  'heavy-crossbow',
  'net',
  'javelin',
  'spear',
  'trident',
  'dart',
]);

export function underwaterDisadvantage(attack: {
  readonly melee: boolean;
  /** The weapon, or a stat block attack named after one. */
  readonly weapon: string;
  readonly swims: boolean;
}): boolean {
  return attack.melee
    ? !attack.swims && !UNDERWATER_MELEE.has(attack.weapon)
    : !UNDERWATER_RANGED.has(attack.weapon);
}
