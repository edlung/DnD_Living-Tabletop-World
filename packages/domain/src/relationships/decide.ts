import { findEntity } from '../kernel/decide/lookups.ts';
import { accept, reject, type Decision, type ResolvedCommandOf } from '../kernel/decision.ts';
import type { WorldState } from '../kernel/state.ts';
import { attitudeOf } from './records.ts';

/**
 * `SetRelationship` (DM or system; docs/adr/0019-continuity-engine.md §3). Only
 * a living NPC's attitude changes, at the current world time. Nothing else
 * follows from it: no memory, knowledge, or disclosure (ADVERSARIAL B4).
 */
export function decideSetRelationship(
  state: WorldState,
  command: ResolvedCommandOf<'SetRelationship'>,
): Decision {
  const npc = findEntity(state, command.npcId);
  if (!npc.ok) return npc;
  if (npc.value.kind !== 'npc') {
    return reject('INVALID_RELATIONSHIP', 'Only an NPC has an attitude toward the party');
  }
  if (npc.value.status !== 'active') {
    return reject('TARGET_DEAD', "A dead NPC's attitude cannot change");
  }
  const from = attitudeOf(state, command.npcId);
  if (from === command.attitude) return reject('NO_EFFECT', `Already ${from}`);
  return accept({
    type: 'RelationshipChanged',
    payload: { npcId: command.npcId, from, to: command.attitude },
  });
}
