import { CorruptHistoryError } from '../kernel/corrupt-history.ts';
import type { RecordedEvent } from '../kernel/events.ts';
import { withEntry, withoutEntry } from '../kernel/maps.ts';
import type { WorldState } from '../kernel/state.ts';
import { holderOf, type KnowledgeRecord } from './records.ts';

/** Fold cases for knowledge events (called from kernel/evolve.ts). */
export function applyKnowledgeAssigned(
  state: WorldState,
  event: Extract<RecordedEvent, { type: 'KnowledgeAssigned' }>,
): WorldState {
  const payload = event.payload;
  if (state.usedIds.has(payload.knowledgeId)) {
    throw new CorruptHistoryError(`id ${payload.knowledgeId} reused`);
  }
  const holder = holderOf(payload.scope);
  const expectedKind = payload.scope.kind === 'CHARACTER' ? 'character' : 'npc';
  if (holder !== null && state.entities.get(holder)?.kind !== expectedKind) {
    throw new CorruptHistoryError(`knowledge ${payload.knowledgeId} has an invalid holder`);
  }
  const referenced = [...payload.subjects, ...(payload.attributedTo ? [payload.attributedTo] : [])];
  if (referenced.some((entityId) => !state.entities.has(entityId))) {
    throw new CorruptHistoryError(`knowledge ${payload.knowledgeId} references a missing entity`);
  }
  if (payload.relations.some((relation) => !state.knowledge.has(relation.knowledgeId))) {
    throw new CorruptHistoryError(`knowledge ${payload.knowledgeId} relates to a missing record`);
  }

  const record: KnowledgeRecord = {
    ...payload,
    origin: {
      sequence: event.sequence,
      commandId: event.causation.commandId,
      actorId: event.causation.actor.actorId,
      recordedAt: event.recordedAt,
      worldTime: event.worldTime,
    },
  };
  return {
    ...state,
    knowledge: withEntry(state.knowledge, payload.knowledgeId, record),
    usedIds: new Set(state.usedIds).add(payload.knowledgeId),
  };
}

export function applyCharacterAssigned(
  state: WorldState,
  event: Extract<RecordedEvent, { type: 'CharacterAssigned' }>,
): WorldState {
  const { characterId, playerActorId } = event.payload;
  if (state.entities.get(characterId)?.kind !== 'character') {
    throw new CorruptHistoryError(`assignment of non-character ${characterId}`);
  }
  if (state.roster.has(characterId) || [...state.roster.values()].includes(playerActorId)) {
    throw new CorruptHistoryError(`duplicate assignment of ${characterId}`);
  }
  return {
    ...state,
    roster: withEntry(state.roster, characterId, playerActorId),
    rosterAssignedAt: withEntry(state.rosterAssignedAt, characterId, event.sequence),
  };
}

/** Undoing an assignment removes the entry (the `roster` restore). */
export function withoutAssignment(state: WorldState, characterId: string): WorldState {
  return {
    ...state,
    roster: withoutEntry(state.roster, characterId),
    rosterAssignedAt: withoutEntry(state.rosterAssignedAt, characterId),
  };
}

export function applyCharacterReleased(
  state: WorldState,
  event: Extract<RecordedEvent, { type: 'CharacterReleased' }>,
): WorldState {
  const { characterId, playerActorId } = event.payload;
  if (state.roster.get(characterId) !== playerActorId) {
    throw new CorruptHistoryError(`release of ${characterId} from a player it did not have`);
  }
  return withoutAssignment(state, characterId);
}

/**
 * Undoing a release (docs/adr/0036-production-sign-in.md §4): the player controls the character
 * again, from the assignment it had, and the roster is back in assignment order, exactly as if
 * the release had never happened.
 */
export function restoreReleasedCharacter(
  state: WorldState,
  restore: {
    readonly characterId: string;
    readonly playerActorId: string;
    readonly assignedAt: number;
  },
): WorldState {
  const { characterId, playerActorId, assignedAt } = restore;
  if (state.entities.get(characterId)?.kind !== 'character') {
    throw new CorruptHistoryError(`restored assignment of non-character ${characterId}`);
  }
  if (state.roster.has(characterId) || [...state.roster.values()].includes(playerActorId)) {
    throw new CorruptHistoryError(`restored assignment of ${characterId} collides`);
  }
  const since = [...withEntry(state.rosterAssignedAt, characterId, assignedAt)].sort(
    ([, a], [, b]) => a - b,
  );
  const roster = withEntry(state.roster, characterId, playerActorId);
  return {
    ...state,
    roster: new Map(since.map(([id]) => [id, roster.get(id) ?? ''])),
    rosterAssignedAt: new Map(since),
  };
}
