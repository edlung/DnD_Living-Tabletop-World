import {
  SECONDS_PER_DAY,
  type MemoryKind,
  type MemoryScope,
  type MemoryView,
  type RecalledMemory,
  type SessionView,
} from '@ltw/contracts';

import { isWithinLocation } from '../kernel/projections/world-view.ts';
import type { WorldState } from '../kernel/state.ts';
import type { ResolvedPerspective } from '../knowledge/perspective.ts';
import { entityRef, isVisible } from '../knowledge/projection.ts';
import { scopeKey } from '../knowledge/records.ts';
import type { MemoryRecord } from './records.ts';

/**
 * Scoped memory retrieval (docs/adr/0010-memory-and-temporal-retrieval.md).
 * Memories are filtered to the perspective FIRST; only visible memories are
 * matched, scored, counted, or ordered, so hidden memories cannot influence
 * any output.
 */
export interface RecallQuery {
  readonly text?: string;
  readonly entityId?: string;
  readonly locationId?: string;
  readonly from?: number;
  readonly to?: number;
  readonly memoryKind?: MemoryKind;
  readonly sessionId?: string;
  /** Memories that had happened by this world time. */
  readonly asOf?: number;
  readonly limit?: number;
}

export type RecallResult =
  | { readonly ok: true; readonly total: number; readonly memories: RecalledMemory[] }
  | { readonly ok: false; readonly reason: 'INVALID_AS_OF' | 'INVALID_WINDOW' };

export const DEFAULT_RECALL_LIMIT = 10;
export const MAX_RECALL_LIMIT = 50;

export function memoryIsVisible(memory: MemoryRecord, perspective: ResolvedPerspective): boolean {
  return perspective.scopes === 'ALL' || perspective.scopes.has(scopeKey(memory.scope));
}

export function visibleMemories(
  state: WorldState,
  perspective: ResolvedPerspective,
  asOf: number | null = null,
): MemoryRecord[] {
  return [...state.memories.values()].filter(
    (memory) =>
      memoryIsVisible(memory, perspective) && (asOf === null || memory.occurredAt <= asOf),
  );
}

export function recallMemories(
  state: WorldState,
  perspective: ResolvedPerspective,
  query: RecallQuery = {},
): RecallResult {
  const asOf = query.asOf ?? null;
  if (asOf !== null && asOf > state.clock) return { ok: false, reason: 'INVALID_AS_OF' };
  if (query.from !== undefined && query.to !== undefined && query.from > query.to) {
    return { ok: false, reason: 'INVALID_WINDOW' };
  }
  const reference = asOf ?? state.clock;
  const terms = tokens(query.text ?? '');

  const scored = visibleMemories(state, perspective, asOf).flatMap((memory) => {
    if (!matchesFilters(state, memory, query)) return [];
    const salience = memory.salience / 5;
    const days = Math.max(0, reference - memory.occurredAt) / SECONDS_PER_DAY;
    const recency = 1 / (1 + days);
    if (terms.size === 0) {
      return [{ memory, score: round(0.625 * salience + 0.375 * recency) }];
    }
    const text = textRelevance(terms, visibleText(state, memory));
    if (text === 0) return [];
    return [{ memory, score: round(0.6 * text + 0.25 * salience + 0.15 * recency) }];
  });

  scored.sort(
    (a, b) =>
      b.score - a.score ||
      b.memory.occurredAt - a.memory.occurredAt ||
      a.memory.memoryId.localeCompare(b.memory.memoryId),
  );
  const limit = Math.min(query.limit ?? DEFAULT_RECALL_LIMIT, MAX_RECALL_LIMIT);
  return {
    ok: true,
    total: scored.length,
    memories: scored
      .slice(0, limit)
      .map(({ memory, score }) => ({ memory: toMemoryView(state, perspective, memory), score })),
  };
}

export function getMemory(
  state: WorldState,
  perspective: ResolvedPerspective,
  memoryId: string,
): MemoryView | null {
  const memory = state.memories.get(memoryId);
  return memory && memoryIsVisible(memory, perspective)
    ? toMemoryView(state, perspective, memory)
    : null;
}

/** Sessions are out-of-world metadata visible to every campaign member (ADR 0010). */
export function listSessions(state: WorldState): SessionView[] {
  return [...state.sessions.values()].map(({ sessionId, title, startedAt, endedAt }) => ({
    sessionId,
    title,
    startedAt,
    endedAt,
  }));
}

export function toMemoryView(
  state: WorldState,
  perspective: ResolvedPerspective,
  memory: MemoryRecord,
): MemoryView {
  return {
    memoryId: memory.memoryId,
    memoryKind: memory.memoryKind,
    scope: copyScope(memory.scope),
    summary: memory.summary,
    occurredAt: memory.occurredAt,
    location: memory.locationId === null ? null : entityRef(state, memory.locationId),
    participants: memory.participants.map((id) => entityRef(state, id)),
    sessionId: memory.sessionId,
    relatedKnowledge: memory.relatedKnowledge.filter((id) => {
      const record = state.knowledge.get(id);
      return record !== undefined && isVisible(record, perspective);
    }),
    causedBy: memory.causedBy.filter((id) => {
      const cause = state.memories.get(id);
      return cause !== undefined && memoryIsVisible(cause, perspective);
    }),
    salience: memory.salience,
  };
}

function matchesFilters(state: WorldState, memory: MemoryRecord, query: RecallQuery): boolean {
  return (
    (query.entityId === undefined ||
      memory.participants.includes(query.entityId) ||
      memory.locationId === query.entityId) &&
    (query.locationId === undefined ||
      (memory.locationId !== null &&
        isWithinLocation(state, memory.locationId, query.locationId))) &&
    (query.from === undefined || memory.occurredAt >= query.from) &&
    (query.to === undefined || memory.occurredAt <= query.to) &&
    (query.memoryKind === undefined || memory.memoryKind === query.memoryKind) &&
    (query.sessionId === undefined || memory.sessionId === query.sessionId)
  );
}

/** Text a viewer of this memory can see: summary, participant and location names. */
function visibleText(state: WorldState, memory: MemoryRecord): string {
  const names = [...memory.participants, ...(memory.locationId ? [memory.locationId] : [])].map(
    (id) => state.entities.get(id)?.name ?? '',
  );
  return [memory.summary, ...names].join(' ');
}

export function tokens(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter((token) => token.length >= 3),
  );
}

function textRelevance(terms: ReadonlySet<string>, text: string): number {
  const words = tokens(text);
  let hits = 0;
  for (const term of terms) if (words.has(term)) hits += 1;
  return hits / terms.size;
}

const round = (value: number) => Math.round(value * 10_000) / 10_000;

function copyScope(scope: MemoryScope): MemoryScope {
  switch (scope.kind) {
    case 'CHARACTER':
      return { kind: 'CHARACTER', characterId: scope.characterId };
    case 'NPC':
      return { kind: 'NPC', npcId: scope.npcId };
    default:
      return { kind: scope.kind };
  }
}
