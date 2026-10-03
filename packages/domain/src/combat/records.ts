import type { z } from 'zod';

import type { combatantRecordSchema, encounterSchema, turnRecordSchema } from './events.ts';

/**
 * Canonical encounter state (docs/adr/0015-combat-engine.md). Plain JSON,
 * defined by the event schemas in `events.ts`, so that an undo can restore
 * the whole encounter as one value. Positions exist only while it runs.
 *
 * - `round` is 0 and `currentIndex` -1 until the first turn starts.
 * - `combatants` are in initiative order; `slowedBy` names the combatant
 *   whose Longbow slowed this one (it ends when that combatant's turn starts).
 * - `turn.slotExpendedThisTurn` is the one-slot-per-turn limit (ADR 0011).
 */
export type TurnRecord = z.infer<typeof turnRecordSchema>;
export type CombatantRecord = z.infer<typeof combatantRecordSchema>;
export type EncounterState = z.infer<typeof encounterSchema>;

export const FRESH_TURN: TurnRecord = {
  actionUsed: false,
  bonusActionUsed: false,
  reactionAvailable: true,
  movementUsedFt: 0,
  slotExpendedThisTurn: false,
  attacksRemaining: 0,
};

export const combatantOf = (encounter: EncounterState, entityId: string) =>
  encounter.combatants.find((combatant) => combatant.entityId === entityId);

export const currentCombatant = (encounter: EncounterState) =>
  encounter.combatants[encounter.currentIndex];

/** True while an encounter runs with this entity in it (ADR 0016 §5: it cannot leave). */
export const isCombatant = (
  state: { readonly encounter: EncounterState | null },
  entityId: string,
) => state.encounter?.combatants.some((c) => c.entityId === entityId) ?? false;

/**
 * The encounter after `combatantId`'s turn starts: the slot-per-turn limit
 * resets for everyone; that creature regains its Reaction and gets a fresh
 * action economy. Shared by the fold and the combat engine so both agree.
 */
export function encounterAfterTurnStart(
  encounter: EncounterState,
  combatantId: string,
  round: number,
): EncounterState | null {
  const index = encounter.combatants.findIndex((c) => c.entityId === combatantId);
  if (index < 0) return null;
  return {
    ...encounter,
    round,
    currentIndex: index,
    combatants: encounter.combatants.map((combatant, position) =>
      position === index
        ? { ...combatant, turn: { ...FRESH_TURN } }
        : { ...combatant, turn: { ...combatant.turn, slotExpendedThisTurn: false } },
    ),
  };
}
