import { CorruptHistoryError } from '../kernel/corrupt-history.ts';
import type { RecordedEvent } from '../kernel/events.ts';
import { withEntry } from '../kernel/maps.ts';
import type { WorldState } from '../kernel/state.ts';
import type { MemoryRecord } from './records.ts';

/** Fold cases for memory and session events (called from kernel/evolve.ts). */
export function applyMemoryRecorded(
  state: WorldState,
  event: Extract<RecordedEvent, { type: 'MemoryRecorded' }>,
): WorldState {
  const payload = event.payload;
  if (state.usedIds.has(payload.memoryId)) {
    throw new CorruptHistoryError(`id ${payload.memoryId} reused`);
  }
  const entities = [
    ...payload.participants,
    ...payload.witnesses,
    ...(payload.locationId ? [payload.locationId] : []),
  ];
  if (
    entities.some((id) => !state.entities.has(id)) ||
    payload.relatedKnowledge.some((id) => !state.knowledge.has(id)) ||
    payload.causedBy.some((id) => !state.memories.has(id)) ||
    (payload.sessionId !== null && !state.sessions.has(payload.sessionId))
  ) {
    throw new CorruptHistoryError(`memory ${payload.memoryId} references something missing`);
  }
  const record: MemoryRecord = {
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
    memories: withEntry(state.memories, payload.memoryId, record),
    usedIds: new Set(state.usedIds).add(payload.memoryId),
  };
}

export function applySessionStarted(
  state: WorldState,
  event: Extract<RecordedEvent, { type: 'SessionStarted' }>,
): WorldState {
  const { sessionId, title } = event.payload;
  if (state.usedIds.has(sessionId) || state.activeSessionId !== null) {
    throw new CorruptHistoryError(`invalid session start ${sessionId}`);
  }
  return {
    ...state,
    sessions: withEntry(state.sessions, sessionId, {
      sessionId,
      title,
      startedAt: event.worldTime,
      endedAt: null,
    }),
    usedIds: new Set(state.usedIds).add(sessionId),
    activeSessionId: sessionId,
  };
}

export function applySessionEnded(
  state: WorldState,
  event: Extract<RecordedEvent, { type: 'SessionEnded' }>,
): WorldState {
  const session = state.sessions.get(event.payload.sessionId);
  if (!session || session.endedAt !== null) {
    throw new CorruptHistoryError(`invalid session end ${event.payload.sessionId}`);
  }
  return {
    ...state,
    sessions: withEntry(state.sessions, session.sessionId, {
      ...session,
      endedAt: event.worldTime,
    }),
    activeSessionId: null,
  };
}
