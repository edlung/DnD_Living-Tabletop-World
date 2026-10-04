import { CHRONICLE_LIMITS } from '@ltw/contracts';

import type { RecordedEvent } from '../kernel/events.ts';
import { facts } from '../kernel/fact-keys.ts';
import type { WorldState } from '../kernel/state.ts';
import type { ResolvedPerspective } from '../knowledge/perspective.ts';
import { isVisible } from '../knowledge/projection.ts';
import { visibleMemories } from '../memory/retrieval.ts';
import type { StoredEntry } from './records.ts';
import { salientEvents } from './salience.ts';

/**
 * A chapter's entries (docs/adr/0024-chronicle.md §1–2). A non-DM
 * perspective is told from its own memories only (ADR 0010), never from raw
 * events: each memory it may see in the window, with the related knowledge
 * it may see and that knowledge's epistemic type. The DM is told from
 * salient events. At most 40, the most salient, in world-time order.
 */
export interface ChronicleDraft {
  readonly entries: StoredEntry[];
  /** Facts the entries rest on. */
  readonly rests: string[];
}

type Unkeyed = { readonly entry: Omit<StoredEntry, 'key'>; readonly rests: readonly string[] };

function memoryEntries(
  state: WorldState,
  perspective: ResolvedPerspective,
  from: number,
  to: number,
): Unkeyed[] {
  return visibleMemories(state, perspective)
    .filter((memory) => memory.occurredAt >= from && memory.occurredAt <= to)
    .map((memory) => {
      const knowledge = memory.relatedKnowledge.flatMap((knowledgeId) => {
        const record = state.knowledge.get(knowledgeId);
        return record && isVisible(record, perspective)
          ? [{ knowledgeId, knowledgeType: record.knowledgeType, statement: record.statement }]
          : [];
      });
      return {
        entry: {
          occurredAt: memory.occurredAt,
          text: memory.summary,
          salience: memory.salience,
          source: { kind: 'memory', memoryId: memory.memoryId },
          memoryKind: memory.memoryKind,
          locationId: memory.locationId,
          participants: [...memory.participants],
          knowledge,
        },
        rests: [
          facts.memory(memory.memoryId),
          ...knowledge.map(({ knowledgeId }) => facts.knowledge(knowledgeId)),
        ],
      };
    });
}

const orderKey = (entry: Omit<StoredEntry, 'key'>) =>
  entry.source.kind === 'memory'
    ? entry.source.memoryId
    : `${entry.source.commandId}#${String(entry.source.index).padStart(3, '0')}`;

export function chronicleEntries(
  state: WorldState,
  history: readonly RecordedEvent[],
  perspective: ResolvedPerspective,
  from: number,
  to: number,
): ChronicleDraft {
  const all: Unkeyed[] =
    perspective.scopes === 'ALL'
      ? salientEvents(state, history, from, to)
      : memoryEntries(state, perspective, from, to);
  const chronological = (a: Unkeyed, b: Unkeyed) =>
    a.entry.occurredAt - b.entry.occurredAt || orderKey(a.entry).localeCompare(orderKey(b.entry));
  const kept = [...all]
    .sort((a, b) => b.entry.salience - a.entry.salience || chronological(a, b))
    .slice(0, CHRONICLE_LIMITS.entries)
    .sort(chronological);
  return {
    entries: kept.map(({ entry }, index) => ({ key: `e${String(index + 1)}`, ...entry })),
    rests: [...new Set(kept.flatMap(({ rests }) => rests))].sort(),
  };
}
