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
import { fills, gapFt, squaresOf, type Placed, type TurnState } from '@ltw/rules';

import { sizeOf, vitalsOf } from './vitals.ts';

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

/** A wall: no one stands in it or crosses it (docs/adr/0049-space-and-movement.md §4). */
export const isWall = (encounter: EncounterState, square: Square) =>
  (encounter.battlefield.walls ?? []).some((w) => sameSquare(w, square));

/**
 * A combatant's place: its north-west square, its size and whether it squeezes
 * (docs/adr/0049-space-and-movement.md §1, §4).
 */
export function placedOf(state: WorldState, record: CombatantRecord): Placed {
  const vitals = vitalsOf(state, record.entityId);
  return {
    position: record.position,
    size: vitals ? sizeOf(vitals) : 'medium',
    squeezed: record.squeezed === true,
  };
}

const COVER_ORDER: readonly (CoverLevel | 'none')[] = ['none', 'half', 'three-quarters', 'total'];

/** A combatant's cover: the least of its squares', as an attacker aims where it is open (§1). */
export function coverOf(
  state: WorldState,
  encounter: EncounterState,
  record: CombatantRecord,
): CoverLevel | 'none' {
  const levels = squaresOf(placedOf(state, record)).map((square) => coverAt(encounter, square));
  return levels.reduce(
    (least, level) => (COVER_ORDER.indexOf(level) < COVER_ORDER.indexOf(least) ? level : least),
    levels[0] ?? 'none',
  );
}

/** The ground's height of a square in feet (ADR 0049 §6): raised or sunk, 0 when unmarked. */
export const groundAt = (encounter: EncounterState, square: Square): number =>
  (encounter.battlefield.ground ?? []).find((g) => sameSquare(g, square))?.ft ?? 0;

/** Water, swum (ADR 0049 §5); deep water immerses (§11). */
export const isWater = (encounter: EncounterState, square: Square): boolean =>
  (encounter.battlefield.water ?? []).some((w) => sameSquare(w, square));
export const isDeepWater = (encounter: EncounterState, square: Square): boolean =>
  (encounter.battlefield.water ?? []).some((w) => sameSquare(w, square) && w.deep === true);

/** The ground under a space: its highest square's, where it stands. */
export const groundOf = (encounter: EncounterState, placed: Placed): number =>
  Math.max(...squaresOf(placed).map((square) => groundAt(encounter, square)));

/** Where a combatant's feet are, in feet: its ground and its height above it (§6). */
export const heightOf = (
  state: WorldState,
  encounter: EncounterState,
  record: CombatantRecord,
): number => groundOf(encounter, placedOf(state, record)) + (record.altitudeFt ?? 0);

/** Feet between a combatant and a space `altitudeFt` above its ground (ADR 0049 §1, §6). */
export function gapToSpace(
  state: WorldState,
  encounter: EncounterState,
  record: CombatantRecord,
  space: Placed,
  altitudeFt: number,
): number {
  const across = gapFt(placedOf(state, record), space);
  const up = Math.abs(
    heightOf(state, encounter, record) - (groundOf(encounter, space) + altitudeFt),
  );
  return Math.max(across, up);
}

/**
 * Feet between two combatants (ADR 0049 §1, §6): between their nearest squares across, and the
 * difference of their heights up, the larger counting as the SRD's grid counts a step up.
 */
export function gapBetween(state: WorldState, a: CombatantRecord, b: CombatantRecord): number {
  const across = gapFt(placedOf(state, a), placedOf(state, b));
  const encounter = state.encounter;
  if (!encounter) return across;
  const up = Math.abs(heightOf(state, encounter, a) - heightOf(state, encounter, b));
  return Math.max(across, up);
}

/** Whether a space lies on the battlefield, clear of walls. */
export const fitsOnField = (encounter: EncounterState, placed: Placed): boolean =>
  squaresOf(placed).every((square) => inBounds(encounter, square) && !isWall(encounter, square));

/** A living combatant other than `except` filling the square (the dead do not block). */
export function occupant(
  state: WorldState,
  encounter: EncounterState,
  square: Square,
  except: string,
): CombatantRecord | undefined {
  return encounter.combatants.find(
    (c) => c.entityId !== except && isAlive(state, c.entityId) && fills(placedOf(state, c), square),
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
