import { findEntity } from '../kernel/decide/lookups.ts';
import {
  accept,
  reject,
  type Decision,
  type DecisionContext,
  type ResolvedCommandOf,
} from '../kernel/decision.ts';
import { isWithinLocation, placementAt } from '../kernel/projections/world-view.ts';
import type { WorldState } from '../kernel/state.ts';
import { isAtOrAfter } from '../kernel/world-time.ts';
import { holderPerspective } from '../knowledge/perspective.ts';
import { isVisible } from '../knowledge/projection.ts';
import { holderOf, scopeKey } from '../knowledge/records.ts';
import { DEFAULT_SALIENCE, PRESENCE_KINDS } from './records.ts';

/**
 * Memory and session decisions (docs/adr/0010-memory-and-temporal-retrieval.md).
 * A memory is accepted only if its holder could have it: nothing from the
 * future, nothing before anyone involved existed, no unwitnessed events,
 * and no citations of knowledge or memories the holder cannot see.
 */
const impossible = (message: string) => reject('IMPOSSIBLE_MEMORY', message);

export function decideRecordMemory(
  context: DecisionContext,
  command: ResolvedCommandOf<'RecordMemory'>,
): Decision {
  const { state, history } = context;
  const { memoryId, scope, memoryKind, occurredAt } = command;
  const participants = command.participants ?? [];
  const relatedKnowledge = command.relatedKnowledge ?? [];
  const causedBy = command.causedBy ?? [];
  const locationId = command.locationId ?? null;

  if (state.usedIds.has(memoryId)) {
    return reject('ID_ALREADY_USED', `ID "${memoryId}" was already used`, { memoryId });
  }
  const holderId = holderOf(scope);
  if (holderId !== null) {
    const holder = findEntity(state, holderId);
    if (!holder.ok) return holder;
    const expected = scope.kind === 'CHARACTER' ? 'character' : 'npc';
    if (holder.value.kind !== expected) {
      return reject('INVALID_MEMORY', `A ${scope.kind} memory must be held by a ${expected}`);
    }
    if (!isAtOrAfter(occurredAt, holder.value.existsSince)) {
      return impossible('The holder did not exist yet');
    }
  }
  if (occurredAt > state.clock) return impossible('Memories cannot come from the future');

  if (new Set(participants).size !== participants.length) {
    return reject('INVALID_MEMORY', 'Participants must be unique');
  }
  for (const id of [...participants, ...(locationId === null ? [] : [locationId])]) {
    const entity = findEntity(state, id);
    if (!entity.ok) return entity;
    if (!isAtOrAfter(occurredAt, entity.value.existsSince)) {
      return impossible(`"${id}" did not exist yet`);
    }
  }
  if (locationId !== null && state.entities.get(locationId)?.kind !== 'location') {
    return reject('NOT_A_LOCATION', `Entity "${locationId}" is not a location`);
  }

  let witnesses: string[] = [];
  if (PRESENCE_KINDS.has(memoryKind) && scope.kind !== 'PUBLIC') {
    if (locationId === null) {
      return reject('INVALID_MEMORY', `${memoryKind} memories need a location`);
    }
    if (memoryKind === 'CONVERSATION' && participants.length === 0) {
      return reject('INVALID_MEMORY', 'A conversation needs participants');
    }
    const candidates = holderId !== null ? [holderId] : [...state.roster.keys()];
    witnesses = candidates.filter((id) => {
      const at = placementAt(state, history, id, occurredAt);
      return (
        at !== null &&
        isWithinLocation(state, at, locationId) &&
        isAtOrAfter(occurredAt, state.entities.get(id)?.existsSince ?? null)
      );
    });
    if (memoryKind === 'CONVERSATION') {
      witnesses = witnesses.filter((id) => participants.includes(id));
    }
    if (witnesses.length === 0) {
      return impossible('Nobody holding this memory was there');
    }
  }

  if (command.sessionId !== undefined && !state.sessions.has(command.sessionId)) {
    return reject('SESSION_NOT_FOUND', `Session "${command.sessionId}" does not exist`);
  }

  const sees = holderPerspective(state, scope);
  if (new Set(relatedKnowledge).size !== relatedKnowledge.length) {
    return reject('INVALID_MEMORY', 'Related knowledge must be unique');
  }
  for (const knowledgeId of relatedKnowledge) {
    const record = state.knowledge.get(knowledgeId);
    if (!record) return reject('KNOWLEDGE_NOT_FOUND', `Knowledge "${knowledgeId}" does not exist`);
    if (!isVisible(record, sees)) return impossible('The holder cannot cite that knowledge');
  }

  if (causedBy.length > 0 && memoryKind !== 'CONSEQUENCE') {
    return reject('INVALID_MEMORY', 'Only CONSEQUENCE memories have causes');
  }
  if (new Set(causedBy).size !== causedBy.length) {
    return reject('INVALID_MEMORY', 'Causes must be unique');
  }
  for (const causeId of causedBy) {
    const cause = state.memories.get(causeId);
    if (!cause) return reject('MEMORY_NOT_FOUND', `Memory "${causeId}" does not exist`);
    if (sees.scopes !== 'ALL' && !sees.scopes.has(scopeKey(cause.scope))) {
      return impossible('The holder cannot cite that memory');
    }
    if (cause.occurredAt > occurredAt) return impossible('A cause cannot follow its consequence');
  }

  return accept({
    type: 'MemoryRecorded',
    payload: {
      memoryId,
      scope,
      memoryKind,
      summary: command.summary,
      occurredAt,
      locationId,
      participants: [...participants],
      sessionId: command.sessionId ?? null,
      relatedKnowledge: [...relatedKnowledge],
      causedBy: [...causedBy],
      salience: command.salience ?? DEFAULT_SALIENCE,
      witnesses,
    },
  });
}

export function decideStartSession(
  state: WorldState,
  command: ResolvedCommandOf<'StartSession'>,
): Decision {
  if (state.usedIds.has(command.sessionId)) {
    return reject('ID_ALREADY_USED', `ID "${command.sessionId}" was already used`);
  }
  if (state.activeSessionId !== null) {
    return reject('SESSION_ALREADY_ACTIVE', 'End the open session first', {
      activeSessionId: state.activeSessionId,
    });
  }
  return accept({
    type: 'SessionStarted',
    payload: { sessionId: command.sessionId, title: command.title },
  });
}

export function decideEndSession(
  state: WorldState,
  command: ResolvedCommandOf<'EndSession'>,
): Decision {
  const session = state.sessions.get(command.sessionId);
  if (!session) return reject('SESSION_NOT_FOUND', `Session "${command.sessionId}" does not exist`);
  if (session.endedAt !== null) {
    return reject('SESSION_NOT_ACTIVE', `Session "${command.sessionId}" has already ended`);
  }
  return accept({ type: 'SessionEnded', payload: { sessionId: session.sessionId } });
}
