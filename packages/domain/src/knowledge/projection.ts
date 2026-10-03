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
  return new Set(knownEntityBases(state, perspective).keys());
}

/**
 * Why a non-DM perspective knows an entity: the premise a decision relied on
 * (Gate 02 remediation, G02-H02). The holder itself, then party members, then
 * the earliest visible record or memory naming it. Recording this premise
 * lets undo see the dependency (ADR 0006 §8).
 */
export type KnowledgeBasis =
  | { readonly kind: 'self' }
  | { readonly kind: 'party-member'; readonly characterId: string }
  | { readonly kind: 'knowledge'; readonly knowledgeId: string; readonly viaParty: boolean }
  | { readonly kind: 'memory'; readonly memoryId: string; readonly viaParty: boolean };

/** Every entity a non-DM perspective knows, with its earliest premise. Single source of `knownEntityIds`. */
export function knownEntityBases(
  state: WorldState,
  perspective: ResolvedPerspective,
): Map<string, KnowledgeBasis> {
  const bases = new Map<string, KnowledgeBasis>();
  const offer = (entityId: string, basis: KnowledgeBasis) => {
    if (!bases.has(entityId) && state.entities.has(entityId)) bases.set(entityId, basis);
  };
  if (perspective.holderId !== null) offer(perspective.holderId, { kind: 'self' });
  if (perspective.scopes === 'ALL' || perspective.scopes.has('PARTY')) {
    for (const characterId of state.roster.keys()) {
      offer(characterId, { kind: 'party-member', characterId });
    }
  }
  const sources = [
    ...visibleRecords(state, perspective).map((record) => ({
      sequence: record.origin.sequence,
      entityIds: [
        ...record.subjects,
        ...(record.attributedTo === null ? [] : [record.attributedTo]),
      ],
      basis: {
        kind: 'knowledge',
        knowledgeId: record.knowledgeId,
        viaParty: record.scope.kind === 'PARTY',
      } as const,
    })),
    // Entities named by visible memories are known too (ADR 0010).
    ...[...state.memories.values()]
      .filter(
        (memory) => perspective.scopes === 'ALL' || perspective.scopes.has(scopeKey(memory.scope)),
      )
      .map((memory) => ({
        sequence: memory.origin.sequence,
        entityIds: [
          ...memory.participants,
          ...(memory.locationId === null ? [] : [memory.locationId]),
        ],
        basis: {
          kind: 'memory',
          memoryId: memory.memoryId,
          viaParty: memory.scope.kind === 'PARTY',
        } as const,
      })),
  ].sort((a, b) => a.sequence - b.sequence);
  for (const { entityIds, basis } of sources) {
    for (const entityId of entityIds) offer(entityId, basis);
  }
  return bases;
}

/**
 * Containment a perspective may use (ADR 0010, amended at Gate 02, G02-H01):
 * `inner` lies in `outer` only along a chain of parent links whose every
 * location the perspective knows. An unknown target, or an unknown link in
 * the chain, behaves exactly like a nonexistent location, so hidden
 * geography never influences a result. Containment between known places
 * counts as known geography.
 */
export function isWithinKnownLocation(
  state: WorldState,
  known: ReadonlySet<string> | ReadonlyMap<string, unknown>,
  inner: string,
  outer: string,
): boolean {
  if (!known.has(outer)) return false;
  const seen = new Set<string>();
  let cursor: string | null = inner;
  while (cursor !== null && known.has(cursor) && !seen.has(cursor)) {
    if (cursor === outer) return true;
    seen.add(cursor);
    cursor = state.entities.get(cursor)?.location?.parentId ?? null;
  }
  return false;
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
  // DM only: provenance and the structured claim (ADR 0014: claims are DM data).
  const { sequence, commandId, actorId, recordedAt, worldTime } = record.origin;
  const claim = state.epistemics.claims.get(record.knowledgeId);
  return {
    ...view,
    origin: { sequence, commandId, actorId, recordedAt, worldTime },
    ...(claim
      ? { claim: { subjectId: claim.subjectId, aspect: claim.aspect, value: claim.value } }
      : {}),
  };
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
