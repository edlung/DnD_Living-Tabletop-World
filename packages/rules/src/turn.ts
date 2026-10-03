import type { CharacterSheet } from '@ltw/contracts';

import { pathCostFt, type Position } from './grid.ts';

/**
 * A creature's action economy during the current turn (docs/adr/0011-ruleset-srd-5-2.md).
 * Action, Bonus Action and movement exist only on the creature's own turn;
 * the Reaction is per round; the one-slot limit applies to every turn.
 */
export interface TurnState {
  readonly ownTurn: boolean;
  readonly actionUsed: boolean;
  readonly bonusActionUsed: boolean;
  readonly reactionAvailable: boolean;
  readonly movementUsedFt: number;
  readonly slotExpendedThisTurn: boolean;
  /** Attacks left from the current Attack action (Extra Attack). */
  readonly attacksRemaining: number;
}

export type IllegalReason =
  | 'INCAPACITATED'
  | 'NOT_YOUR_TURN'
  | 'NO_ACTION'
  | 'NO_BONUS_ACTION'
  | 'NO_REACTION'
  | 'NOT_KNOWN'
  | 'NO_SLOT'
  | 'SLOT_TOO_LOW'
  | 'SLOT_ALREADY_USED_THIS_TURN'
  | 'NO_FREE_CAST'
  | 'OUT_OF_RANGE'
  | 'TARGET_REQUIRED'
  | 'TARGET_NOT_VISIBLE'
  | 'DESTINATION_INVALID'
  | 'NO_VALID_TRIGGER'
  | 'NO_WEAPON'
  | 'TOTAL_COVER'
  | 'NO_ATTACKS_LEFT'
  | 'INVALID_PATH'
  | 'NOT_ENOUGH_MOVEMENT';

export interface Illegal {
  readonly legal: false;
  readonly reason: IllegalReason;
  /** How the actor could make it legal, e.g. move closer (spec: Critical Context Contract). */
  readonly resolution?: { readonly moveRequiredFt?: number };
}

export const illegal = (reason: IllegalReason, resolution?: Illegal['resolution']): Illegal =>
  resolution ? { legal: false, reason, resolution } : { legal: false, reason };

/** State at the start of a turn. `previous` is this creature's state at the end of the last turn. */
export function startTurn(ownTurn: boolean, previous?: TurnState): TurnState {
  return {
    ownTurn,
    actionUsed: false,
    bonusActionUsed: false,
    reactionAvailable: ownTurn ? true : (previous?.reactionAvailable ?? true),
    movementUsedFt: 0,
    slotExpendedThisTurn: false,
    attacksRemaining: 0,
  };
}

/** Incapacitated, or Unconscious, which includes it (ADR 0015 §4). */
export const isIncapacitated = (sheet: Pick<CharacterSheet, 'conditions'>) =>
  sheet.conditions.some((c) => c === 'incapacitated' || c === 'unconscious');

/** Speed after conditions; Slowed (Slow mastery) reduces Speed by 10 ft. */
export function effectiveSpeedFt(sheet: CharacterSheet): number {
  return Math.max(0, sheet.speedFt - (sheet.conditions.includes('slowed') ? 10 : 0));
}

export type MoveCheck =
  { readonly legal: true; readonly costFt: number; readonly remainingFt: number } | Illegal;

export function checkMove(
  sheet: CharacterSheet,
  turn: TurnState,
  path: readonly Position[],
  isDifficult?: (position: Position) => boolean,
): MoveCheck {
  if (isIncapacitated(sheet)) return illegal('INCAPACITATED');
  if (!turn.ownTurn) return illegal('NOT_YOUR_TURN');
  const cost = pathCostFt(path, isDifficult);
  if (!cost.valid) return illegal('INVALID_PATH');
  const remaining = effectiveSpeedFt(sheet) - turn.movementUsedFt;
  if (cost.costFt > remaining) return illegal('NOT_ENOUGH_MOVEMENT');
  return { legal: true, costFt: cost.costFt, remainingFt: remaining - cost.costFt };
}

export function applyMove(turn: TurnState, costFt: number): TurnState {
  return { ...turn, movementUsedFt: turn.movementUsedFt + costFt };
}
