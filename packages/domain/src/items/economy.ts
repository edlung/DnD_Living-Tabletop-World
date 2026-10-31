import { combatantOf } from '../combat/records.ts';
import { reject, type Decision } from '../kernel/decision.ts';
import type { KernelEvent } from '../kernel/events.ts';
import type { WorldState } from '../kernel/state.ts';

/**
 * What an item action costs a combatant on its own turn (docs/adr/0039-item-possession.md,
 * Stage 490): a potion or a worn-gear change is a Bonus Action, a shield or a mundane use an
 * Action, handing something over a Bonus Action beside the receiver, and dropping is free.
 * Outside an encounter nothing is spent. The turn is spent by an ordinary `CombatantUpdated`
 * beside the item event, so undo and replay need no special case.
 */
export type ItemCost = 'free' | 'action' | 'bonus';

export function spendTurn(
  state: WorldState,
  characterId: string,
  cost: ItemCost,
): { readonly ok: true; readonly events: KernelEvent[] } | (Decision & { ok: false }) {
  const encounter = state.encounter;
  const combatant = encounter ? combatantOf(encounter, characterId) : undefined;
  if (!encounter || !combatant) return { ok: true, events: [] };
  if (encounter.combatants[encounter.currentIndex]?.entityId !== characterId)
    return reject('ILLEGAL_ACTION', 'NOT_YOUR_TURN');
  if (cost === 'action' && combatant.turn.actionUsed) return reject('ILLEGAL_ACTION', 'NO_ACTION');
  if (cost === 'bonus' && combatant.turn.bonusActionUsed)
    return reject('ILLEGAL_ACTION', 'NO_BONUS_ACTION');
  if (cost === 'free') return { ok: true, events: [] };
  const turn =
    cost === 'action'
      ? { ...combatant.turn, actionUsed: true }
      : { ...combatant.turn, bonusActionUsed: true };
  return {
    ok: true,
    events: [{ type: 'CombatantUpdated', payload: { combatant: { ...combatant, turn } } }],
  };
}

/** Squares apart (diagonals count one): beside means one square or less. */
export function adjacentInEncounter(state: WorldState, a: string, b: string): boolean {
  const encounter = state.encounter;
  const first = encounter ? combatantOf(encounter, a) : undefined;
  const second = encounter ? combatantOf(encounter, b) : undefined;
  if (!first || !second) return false;
  return (
    Math.max(
      Math.abs(first.position.x - second.position.x),
      Math.abs(first.position.y - second.position.y),
    ) <= 1
  );
}
