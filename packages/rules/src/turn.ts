import type { CharacterSheet } from '@ltw/contracts';

import { incapacitatedBy, speedAfterConditions } from './conditions.ts';
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
  | 'NOT_ENOUGH_MOVEMENT'
  /** A Charmed creature's attack or harmful spell at its charmer (ADR 0045 §1). */
  | 'CHARMED_BY_TARGET'
  /** A Frightened creature's move closer to the source of its fear (ADR 0045 §1). */
  | 'CLOSER_TO_FEAR'
  /** An action's check with a skill that action does not use (ADR 0045 §5). */
  | 'INVALID_SKILL'
  /** Help in a fight is against a foe within 5 ft (§5). */
  | 'NOT_A_FOE'
  /** Hide from behind Three-Quarters or Total Cover (§5). */
  | 'NO_COVER_TO_HIDE'
  /**
   * The weapons' rules (docs/adr/0047-weapons.md): no ammunition of the kind left; both hands
   * needed while a shield is held; a Loading weapon fired already with this action; no extra
   * attack on offer (the other hand's, or Cleave's).
   */
  | 'NO_AMMUNITION'
  | 'HANDS_FULL'
  | 'LOADING'
  | 'NO_EXTRA_ATTACK';

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

/** Incapacitated, or a condition that includes it (docs/adr/0045-conditions-and-actions.md §1). */
export const isIncapacitated = (sheet: Pick<CharacterSheet, 'conditions'>) =>
  incapacitatedBy(sheet.conditions);

/** Speed after conditions and Exhaustion (ADR 0045 §1, §3); Slowed (Slow mastery) takes 10 ft. */
export function effectiveSpeedFt(sheet: CharacterSheet): number {
  return speedAfterConditions(sheet.speedFt, sheet.conditions, sheet.exhaustion ?? 0);
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
