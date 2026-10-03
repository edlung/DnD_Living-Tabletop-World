import type { KnowledgeOrigin, MemoryKind, MemoryScope } from '@ltw/contracts';

/**
 * Canonical memory and session records (docs/adr/0010-memory-and-temporal-retrieval.md).
 * Memories have one holder scope and are immutable. Canonical data: it may
 * only reach a perspective through `memory/retrieval.ts`.
 */
export interface MemoryRecord {
  readonly memoryId: string;
  readonly scope: MemoryScope;
  readonly memoryKind: MemoryKind;
  readonly summary: string;
  readonly occurredAt: number;
  readonly locationId: string | null;
  readonly participants: readonly string[];
  readonly sessionId: string | null;
  readonly relatedKnowledge: readonly string[];
  readonly causedBy: readonly string[];
  readonly salience: number;
  /** Holder or party members whose presence made the memory possible. */
  readonly witnesses: readonly string[];
  readonly origin: KnowledgeOrigin;
}

export interface SessionRecord {
  readonly sessionId: string;
  readonly title: string;
  readonly startedAt: number;
  readonly endedAt: number | null;
}

export const DEFAULT_SALIENCE = 3;

/** Kinds that require the holder (or a party member) to have been present. */
export const PRESENCE_KINDS: ReadonlySet<MemoryKind> = new Set(['OBSERVATION', 'CONVERSATION']);
