import { findEntity } from '../kernel/decide/lookups.ts';
import { accept, reject, type Decision, type ResolvedCommandOf } from '../kernel/decision.ts';
import type { WorldState } from '../kernel/state.ts';

/**
 * `SetStatBlock` (DM): the statistics and current vitals of a non-character
 * combatant (docs/adr/0015-combat-engine.md §5). Characters use sheets.
 */
export function decideSetStatBlock(
  state: WorldState,
  command: ResolvedCommandOf<'SetStatBlock'>,
): Decision {
  const found = findEntity(state, command.entityId);
  if (!found.ok) return found;
  if (found.value.kind !== 'npc' && found.value.kind !== 'creature') {
    return reject(
      'INVALID_ENCOUNTER',
      'Only NPCs and creatures have stat blocks; characters have sheets',
    );
  }
  if (state.encounter?.combatants.some((c) => c.entityId === command.entityId)) {
    return reject('COMBAT_ALREADY_ACTIVE', 'A combatant’s stat block changes only through combat');
  }
  return accept({
    type: 'StatBlockSet',
    payload: { entityId: command.entityId, statBlock: command.statBlock },
  });
}
