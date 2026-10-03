import type { EntityRef, KnowledgeEdge, KnowledgeType, KnowledgeView } from '@ltw/contracts';

import type { WorldState } from '../kernel/state.ts';
import type { ResolvedPerspective } from './perspective.ts';
import { entityRef, knownEntityIds, sortRefs, toView, visibleRecords } from './projection.ts';

/**
 * Perspective-scoped knowledge queries. Each returns only what the resolved
 * perspective may see; a hidden record or entity is reported exactly like a
 * nonexistent one (`null`).
 */
export interface KnowledgeFilter {
  readonly knowledgeType?: KnowledgeType;
  readonly subjectId?: string;
  /** World time; must not be later than the current world clock. */
  readonly asOf?: number;
}

export type ListResult =
  | { readonly ok: true; readonly knowledge: KnowledgeView[] }
  | { readonly ok: false; readonly reason: 'INVALID_AS_OF' };

export function listKnowledge(
  state: WorldState,
  perspective: ResolvedPerspective,
  filter: KnowledgeFilter = {},
): ListResult {
  const asOf = filter.asOf ?? null;
  if (asOf !== null && asOf > state.clock) return { ok: false, reason: 'INVALID_AS_OF' };
  const records = visibleRecords(state, perspective, asOf);
  const visibleIds = new Set(records.map((record) => record.knowledgeId));
  const selected = records.filter(
    (record) =>
      (filter.knowledgeType === undefined || record.knowledgeType === filter.knowledgeType) &&
      (filter.subjectId === undefined || record.subjects.includes(filter.subjectId)),
  );
  return {
    ok: true,
    knowledge: selected.map((record) => toView(state, perspective, record, visibleIds)),
  };
}

export function getKnowledge(
  state: WorldState,
  perspective: ResolvedPerspective,
  knowledgeId: string,
): KnowledgeView | null {
  const records = visibleRecords(state, perspective);
  const record = records.find((candidate) => candidate.knowledgeId === knowledgeId);
  if (!record) return null;
  return toView(state, perspective, record, new Set(records.map((r) => r.knowledgeId)));
}

/** Breadth-first neighborhood over relations whose both ends are visible. */
export function relatedKnowledge(
  state: WorldState,
  perspective: ResolvedPerspective,
  knowledgeId: string,
  depth: number,
): { rootId: string; nodes: KnowledgeView[]; edges: KnowledgeEdge[] } | null {
  const records = visibleRecords(state, perspective);
  const byId = new Map(records.map((record) => [record.knowledgeId, record]));
  if (!byId.has(knowledgeId)) return null;

  const edges: KnowledgeEdge[] = records.flatMap((record) =>
    record.relations
      .filter((relation) => byId.has(relation.knowledgeId))
      .map((relation) => ({
        from: record.knowledgeId,
        type: relation.type,
        to: relation.knowledgeId,
      })),
  );
  const reached = [knowledgeId];
  const seen = new Set(reached);
  let frontier = [knowledgeId];
  for (let level = 0; level < depth && frontier.length > 0; level += 1) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const edge of edges) {
        const neighbor = edge.from === id ? edge.to : edge.to === id ? edge.from : null;
        if (neighbor !== null && !seen.has(neighbor)) {
          seen.add(neighbor);
          next.push(neighbor);
          reached.push(neighbor);
        }
      }
    }
    frontier = next;
  }

  const visibleIds = new Set(byId.keys());
  const recordOf = (id: string) => {
    const record = byId.get(id);
    if (!record) throw new Error(`unreachable: ${id} is not visible`);
    return record;
  };
  return {
    rootId: knowledgeId,
    nodes: reached.map((id) => toView(state, perspective, recordOf(id), visibleIds)),
    edges: edges.filter((edge) => seen.has(edge.from) && seen.has(edge.to)),
  };
}

/** What the perspective knows about an entity, and which other entities those records mention. */
export function entityKnowledge(
  state: WorldState,
  perspective: ResolvedPerspective,
  entityId: string,
): { entity: EntityRef; knowledge: KnowledgeView[]; relatedEntities: EntityRef[] } | null {
  if (!knownEntityIds(state, perspective).has(entityId)) return null;
  const records = visibleRecords(state, perspective);
  const visibleIds = new Set(records.map((record) => record.knowledgeId));
  const about = records.filter(
    (record) => record.subjects.includes(entityId) || record.attributedTo === entityId,
  );
  const related = new Set<string>();
  for (const record of about) {
    record.subjects.forEach((id) => related.add(id));
    if (record.attributedTo !== null) related.add(record.attributedTo);
  }
  related.delete(entityId);
  return {
    entity: entityRef(state, entityId),
    knowledge: about.map((record) => toView(state, perspective, record, visibleIds)),
    relatedEntities: sortRefs([...related].map((id) => entityRef(state, id))),
  };
}

export function knownEntities(state: WorldState, perspective: ResolvedPerspective): EntityRef[] {
  return sortRefs([...knownEntityIds(state, perspective)].map((id) => entityRef(state, id)));
}
