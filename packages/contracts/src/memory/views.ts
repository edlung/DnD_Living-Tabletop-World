import type { MemoryKind, MemoryScope } from './commands.ts';
import type { EntityRef } from '../knowledge/views.ts';

/**
 * Perspective-scoped memory views (docs/adr/0010-memory-and-temporal-retrieval.md).
 * Every field is whitelisted; references to things the perspective cannot
 * see are omitted, never hinted at.
 */
export interface MemoryView {
  readonly memoryId: string;
  readonly memoryKind: MemoryKind;
  readonly scope: MemoryScope;
  readonly summary: string;
  readonly occurredAt: number;
  readonly location: EntityRef | null;
  readonly participants: readonly EntityRef[];
  readonly sessionId: string | null;
  readonly relatedKnowledge: readonly string[];
  readonly causedBy: readonly string[];
  readonly salience: number;
}

export interface RecalledMemory {
  readonly memory: MemoryView;
  /** Deterministic relevance in [0, 1], computed only over visible memories. */
  readonly score: number;
}

export interface SessionView {
  readonly sessionId: string;
  readonly title: string;
  readonly startedAt: number;
  readonly endedAt: number | null;
}

export interface MemoryRecallResponse {
  readonly perspective: string;
  readonly asOf: number | null;
  /** Number of visible memories matching the filters (before `limit`). */
  readonly total: number;
  readonly memories: readonly RecalledMemory[];
}

export interface MemoryRecordResponse {
  readonly perspective: string;
  readonly memory: MemoryView;
}

export interface SessionListResponse {
  readonly sessions: readonly SessionView[];
}
