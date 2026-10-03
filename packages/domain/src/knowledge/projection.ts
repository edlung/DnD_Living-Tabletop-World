import type { EntityRef, KnowledgeScope, KnowledgeView } from '@ltw/contracts';

import type { WorldState } from '../kernel/state.ts';
import type { ResolvedPerspective } from './perspective.ts';
import { scopeKey, type KnowledgeRecord } from './records.ts';

/**
 * The only path from canonical knowledge to a perspective
 * (docs/adr/0008-knowledge-boundary.md). Views are built field by field from
 * an explicit whitelist; canonical objects are never passed through, so a
 * new canonical field can never leak by accident.
 */
export function isVisible(record: KnowledgeRecord, perspective: ResolvedPerspective): boolean {
  return perspective.scopes === 'ALL' || perspective.scopes.has(scopeKey(record.scope));
}

/** Visible records in assignment order, optionally as known at world time `asOf`. */
export function visibleRecords(
  state: WorldState,
  perspective: ResolvedPerspective,
  asOf: number | null = null,
): KnowledgeRecord[] {
  return [...state.knowledge.values()].filter(
    (record) =>
      isVisible(record, perspective) &&
      (asOf === null || record.knownSince === null || record.knownSince <= asOf),
  );
}

/** Entity IDs the perspective knows exist (ADR 0008 "Entities", ADR 0010). */
export function knownEntityIds(state: WorldState, perspective: ResolvedPerspective): Set<string> {
  if (perspective.scopes === 'ALL') return new Set(state.entities.keys());
  const known = new Set<string>();
  for (const record of visibleRecords(state, perspective)) {
    record.subjects.forEach((entityId) => known.add(entityId));
    if (record.attributedTo !== null) known.add(record.attributedTo);
  }
  for (const memory of state.memories.values()) {
    // Entities named by visible memories are known too (ADR 0010).
    if (!perspective.scopes.has(scopeKey(memory.scope))) continue;
    memory.participants.forEach((entityId) => known.add(entityId));
    if (memory.locationId !== null) known.add(memory.locationId);
  }
  if (perspective.holderId !== null) known.add(perspective.holderId);
  if (perspective.scopes.has('PARTY')) {
    for (const characterId of state.roster.keys()) known.add(characterId);
  }
  return new Set([...known].filter((entityId) => state.entities.has(entityId)));
}

/** Identity only: never the canonical description, placement, or status. */
export function entityRef(state: WorldState, entityId: string): EntityRef {
  const entity = state.entities.get(entityId);
  if (!entity) throw new Error(`entity ${entityId} is missing from canonical state`);
  return { entityId: entity.entityId, kind: entity.kind, name: entity.name };
}

export function toView(
  state: WorldState,
  perspective: ResolvedPerspective,
  record: KnowledgeRecord,
  visibleIds: ReadonlySet<string>,
): KnowledgeView {
  const view: KnowledgeView = {
    knowledgeId: record.knowledgeId,
    knowledgeType: record.knowledgeType,
    scope: copyScope(record.scope),
    statement: record.statement,
    subjects: record.subjects.map((entityId) => entityRef(state, entityId)),
    attributedTo: record.attributedTo === null ? null : entityRef(state, record.attributedTo),
    relations: record.relations
      .filter((relation) => visibleIds.has(relation.knowledgeId))
      .map((relation) => ({ type: relation.type, knowledgeId: relation.knowledgeId })),
    knownSince: record.knownSince,
  };
  if (perspective.scopes !== 'ALL') return view;
  const { sequence, commandId, actorId, recordedAt, worldTime } = record.origin;
  return { ...view, origin: { sequence, commandId, actorId, recordedAt, worldTime } };
}

function copyScope(scope: KnowledgeScope): KnowledgeScope {
  switch (scope.kind) {
    case 'CHARACTER':
      return { kind: 'CHARACTER', characterId: scope.characterId };
    case 'NPC':
      return { kind: 'NPC', npcId: scope.npcId };
    default:
      return { kind: scope.kind };
  }
}

export function sortRefs(refs: Iterable<EntityRef>): EntityRef[] {
  return [...refs].sort((a, b) => a.entityId.localeCompare(b.entityId));
}
