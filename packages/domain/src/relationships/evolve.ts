import { CorruptHistoryError } from '../kernel/corrupt-history.ts';
import type { RecordedEvent, Restore } from '../kernel/events.ts';
import { withEntry, withoutEntry } from '../kernel/maps.ts';
import type { WorldState } from '../kernel/state.ts';
import { attitudeOf } from './records.ts';

/** Fold and undo restore of relationships (docs/adr/0019-continuity-engine.md §3). */
export function applyRelationshipChanged(
  state: WorldState,
  event: Extract<RecordedEvent, { type: 'RelationshipChanged' }>,
): WorldState {
  const { npcId, from, to } = event.payload;
  if (state.entities.get(npcId)?.kind !== 'npc') {
    throw new CorruptHistoryError(`relationship of unknown NPC ${npcId}`);
  }
  if (attitudeOf(state, npcId) !== from) {
    throw new CorruptHistoryError(`relationship of ${npcId} was not ${from}`);
  }
  return { ...state, relationships: withEntry(state.relationships, npcId, to) };
}

export function applyRelationshipRestore(
  state: WorldState,
  restore: Extract<Restore, { fact: 'relationship' }>,
): WorldState {
  return {
    ...state,
    relationships:
      restore.value === null
        ? withoutEntry(state.relationships, restore.npcId)
        : withEntry(state.relationships, restore.npcId, restore.value),
  };
}
