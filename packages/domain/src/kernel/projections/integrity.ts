import { WORLD_TRUTH_TYPES, holderOf } from '../../knowledge/records.ts';
import { PLACEABLE_KINDS, STATUSES_BY_KIND, type WorldState } from '../state.ts';
import { isAtOrAfter } from '../world-time.ts';

/**
 * Structural invariants every canonical state must satisfy, whatever
 * sequence of accepted commands (including undos) produced it. Returns the
 * violations found; an empty list means the state is consistent.
 */
export function checkWorldIntegrity(state: WorldState): string[] {
  const violations: string[] = [];
  const report = (message: string) => violations.push(message);
  const isLocation = (id: string) => state.entities.get(id)?.kind === 'location';

  if (state.version > 0 && state.campaign === null) report('events exist without a campaign');

  for (const [id, entity] of state.entities) {
    if (id !== entity.entityId) report(`entity key ${id} != ${entity.entityId}`);
    if (!state.usedIds.has(id)) report(`entity ${id} missing from used IDs`);
    if (entity.existsSince !== null && entity.existsSince > state.clock) {
      report(`entity ${id} exists after the clock`);
    }
    if (!STATUSES_BY_KIND[entity.kind].includes(entity.status)) {
      report(`entity ${id} has status ${entity.status} invalid for ${entity.kind}`);
    }
    if ((entity.kind === 'location') !== (entity.location !== null)) {
      report(`entity ${id} location data does not match kind ${entity.kind}`);
    }
    const parentId = entity.location?.parentId ?? null;
    if (parentId !== null) {
      const parent = state.entities.get(parentId);
      if (!parent || parent.kind !== 'location') {
        report(`location ${id} has missing parent ${parentId}`);
      } else if (!isAtOrAfter(entity.existsSince, parent.existsSince)) {
        report(`location ${id} exists before its parent ${parentId}`);
      }
    }
    if (entity.placement !== null) {
      const { locationId, since } = entity.placement;
      if (!PLACEABLE_KINDS.has(entity.kind)) {
        report(`entity ${id} of kind ${entity.kind} is placed`);
      }
      if (!isLocation(locationId)) report(`entity ${id} placed in non-location ${locationId}`);
      if (!isAtOrAfter(since, entity.existsSince)) report(`entity ${id} placed before it existed`);
      if (since !== null && since > state.clock) report(`entity ${id} placed after the clock`);
    }
  }

  for (const id of state.entities.keys()) {
    const seen = new Set<string>();
    let cursor: string | null = id;
    while (cursor !== null) {
      if (seen.has(cursor)) {
        report(`location cycle through ${id}`);
        break;
      }
      seen.add(cursor);
      cursor = state.entities.get(cursor)?.location?.parentId ?? null;
    }
  }

  const openScenes = [...state.scenes.values()].filter((scene) => scene.endedAt === null);
  if (openScenes.length > 1) report('more than one active scene');
  if ((openScenes[0]?.sceneId ?? null) !== state.activeSceneId) {
    report('active scene pointer does not match the open scene');
  }
  for (const [id, scene] of state.scenes) {
    if (!state.usedIds.has(id)) report(`scene ${id} missing from used IDs`);
    if (!isLocation(scene.locationId)) report(`scene ${id} at non-location ${scene.locationId}`);
    if (scene.startedAt > state.clock) report(`scene ${id} starts after the clock`);
    if (scene.endedAt !== null && scene.endedAt < scene.startedAt) {
      report(`scene ${id} ends before it starts`);
    }
  }

  for (const [id, record] of state.knowledge) {
    if (id !== record.knowledgeId) report(`knowledge key ${id} != ${record.knowledgeId}`);
    if (!state.usedIds.has(id)) report(`knowledge ${id} missing from used IDs`);
    const holder = holderOf(record.scope);
    const holderKind = record.scope.kind === 'CHARACTER' ? 'character' : 'npc';
    if (holder !== null && state.entities.get(holder)?.kind !== holderKind) {
      report(`knowledge ${id} has an invalid holder`);
    }
    if (record.scope.kind === 'WORLD_TRUTH' && !WORLD_TRUTH_TYPES.has(record.knowledgeType)) {
      report(`knowledge ${id} is WORLD_TRUTH of type ${record.knowledgeType}`);
    }
    for (const entityId of [
      ...record.subjects,
      ...(record.attributedTo ? [record.attributedTo] : []),
    ]) {
      if (!state.entities.has(entityId)) report(`knowledge ${id} references missing ${entityId}`);
    }
    for (const relation of record.relations) {
      if (!state.knowledge.has(relation.knowledgeId)) {
        report(`knowledge ${id} relates to missing ${relation.knowledgeId}`);
      }
    }
    if (record.knownSince !== null && record.knownSince > state.clock) {
      report(`knowledge ${id} learned after the clock`);
    }
  }

  const players = new Set<string>();
  for (const [characterId, playerId] of state.roster) {
    if (state.entities.get(characterId)?.kind !== 'character') {
      report(`roster entry ${characterId} is not a character`);
    }
    if (players.has(playerId)) report(`player ${playerId} controls several characters`);
    if (playerId === state.campaign?.dmActorId) report('the DM is also a player');
    players.add(playerId);
  }

  for (const [id, memory] of state.memories) {
    if (!state.usedIds.has(id)) report(`memory ${id} missing from used IDs`);
    const referenced = [
      ...memory.participants,
      ...memory.witnesses,
      ...(memory.locationId === null ? [] : [memory.locationId]),
    ];
    if (referenced.some((entityId) => !state.entities.has(entityId))) {
      report(`memory ${id} references a missing entity`);
    }
    if (memory.relatedKnowledge.some((k) => !state.knowledge.has(k))) {
      report(`memory ${id} cites missing knowledge`);
    }
    if (memory.causedBy.some((m) => !state.memories.has(m))) {
      report(`memory ${id} cites a missing cause`);
    }
    if (memory.occurredAt > state.clock) report(`memory ${id} is from the future`);
  }
  const openSessions = [...state.sessions.values()].filter((session) => session.endedAt === null);
  if ((openSessions[0]?.sessionId ?? null) !== state.activeSessionId || openSessions.length > 1) {
    report('active session pointer does not match the open session');
  }

  for (const trace of state.commands.values()) {
    if (
      trace.undoneBy !== null &&
      state.commands.get(trace.undoneBy)?.commandType !== 'UndoCommand'
    ) {
      report(`command ${trace.commandId} undone by a non-undo command`);
    }
  }
  return violations;
}
