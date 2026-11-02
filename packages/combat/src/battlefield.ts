import type { CoverLevel, Square } from '@ltw/contracts';
import {
  combatantOf,
  currentCombatant,
  reject,
  type CombatantRecord,
  type Decision,
  type DraftEvent,
  type EncounterState,
  type TurnRecord,
  type WorldState,
} from '@ltw/domain';
import type { TurnState } from '@ltw/rules';

/**
 * Encounter lookups shared by the combat decisions and the Context Engine
 * (docs/adr/0015-combat-engine.md §1–2).
 */
export type Found<T> = { readonly ok: true; readonly value: T } | (Decision & { ok: false });

/**
 * One answer for "no encounter" and "an encounter you are not in", with the
 * same message: a character outside a fight cannot learn that it exists
 * (ADR 0016 §4).
 */
export const notInCombat = () => reject('NOT_IN_COMBAT', 'NOT_IN_COMBAT');

export function encounterOf(state: WorldState): Found<EncounterState> {
  return state.encounter ? { ok: true, value: state.encounter } : notInCombat();
}

/** The combatant whose turn it is, which must be `combatantId`. */
export function onTurn(encounter: EncounterState, combatantId: string): Found<CombatantRecord> {
  const combatant = combatantOf(encounter, combatantId);
  if (!combatant) return notInCombat();
  if (currentCombatant(encounter)?.entityId !== combatantId) {
    return reject('NOT_YOUR_TURN', 'Not this combatant’s turn');
  }
  return { ok: true, value: combatant };
}

export const isAlive = (state: WorldState, entityId: string) =>
  state.entities.get(entityId)?.status === 'active';

const sameSquare = (a: Square, b: Square) => a.x === b.x && a.y === b.y;

export const inBounds = (encounter: EncounterState, square: Square) =>
  square.x < encounter.battlefield.width && square.y < encounter.battlefield.height;

export function coverAt(encounter: EncounterState, square: Square): CoverLevel | 'none' {
  return encounter.battlefield.cover.find((c) => sameSquare(c, square))?.level ?? 'none';
}

export const isDifficult = (encounter: EncounterState, square: Square) =>
  encounter.battlefield.difficult.some((d) => sameSquare(d, square));

/** A living combatant other than `except` standing on the square (the dead do not block). */
export function occupant(
  state: WorldState,
  encounter: EncounterState,
  square: Square,
  except: string,
): CombatantRecord | undefined {
  return encounter.combatants.find(
    (c) => c.entityId !== except && sameSquare(c.position, square) && isAlive(state, c.entityId),
  );
}

/** The rules' view of a combatant's action economy right now. */
export function turnStateOf(encounter: EncounterState, combatant: CombatantRecord): TurnState {
  return {
    ...combatant.turn,
    ownTurn: currentCombatant(encounter)?.entityId === combatant.entityId,
  };
}

export function withTurn(
  combatant: CombatantRecord,
  turn: TurnState | TurnRecord,
): CombatantRecord {
  const {
    actionUsed,
    bonusActionUsed,
    reactionAvailable,
    movementUsedFt,
    slotExpendedThisTurn,
    attacksRemaining,
  } = turn;
  // The actions' marks (Dash, Dodge, Help…; docs/adr/0045-conditions-and-actions.md §5) stay.
  return {
    ...combatant,
    turn: {
      ...combatant.turn,
      actionUsed,
      bonusActionUsed,
      reactionAvailable,
      movementUsedFt,
      slotExpendedThisTurn,
      attacksRemaining,
    },
  };
}

export const combatantEvent = (combatant: CombatantRecord): DraftEvent => ({
  type: 'CombatantUpdated',
  payload: { combatant },
});
