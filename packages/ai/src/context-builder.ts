import type { EntityRef } from '@ltw/contracts';
import {
  formatWorldTime,
  knownEntities,
  visibleRecords,
  type ResolvedPerspective,
  type WorldState,
} from '@ltw/domain';

/**
 * ContextBuilder (docs/adr/0017-ai-gateway.md §3). An AI context is built
 * only from one resolved knowledge perspective (ADR 0008) and only from its
 * projections: the entities it knows, the records it may see, the world
 * time. Every item names its source, so a trace can say why the system knew
 * it (invariant 18). Nothing else in the world state is read.
 */
export type ContextSection = 'entities' | 'world-time' | 'records';

export interface ContextItem {
  /** Entity ID, knowledge ID, or `world#clock`. */
  readonly sourceId: string;
  readonly kind: 'entity' | 'world-time' | 'record';
  readonly text: string;
}

export interface BuiltContext {
  /** The perspective the context came from, for example `PUBLIC`. */
  readonly scope: string;
  readonly items: readonly ContextItem[];
  /** The entities in the context, for structured consumers and validation. */
  readonly entities: readonly EntityRef[];
  readonly worldTime: number;
}

export function buildContext(
  state: WorldState,
  perspective: ResolvedPerspective,
  sections: readonly ContextSection[],
): BuiltContext {
  const items: ContextItem[] = [];
  const entities = sections.includes('entities') ? knownEntities(state, perspective) : [];
  if (sections.includes('world-time')) {
    items.push({
      sourceId: 'world#clock',
      kind: 'world-time',
      text: `World time: ${formatWorldTime(state.clock)}`,
    });
  }
  for (const entity of entities) {
    items.push({
      sourceId: entity.entityId,
      kind: 'entity',
      text: `${entity.entityId} (${entity.kind}): ${entity.name}`,
    });
  }
  if (sections.includes('records')) {
    for (const record of visibleRecords(state, perspective)) {
      items.push({
        sourceId: record.knowledgeId,
        kind: 'record',
        text: `${record.knowledgeType}: ${record.statement}`,
      });
    }
  }
  return { scope: perspective.label, items, entities, worldTime: state.clock };
}
