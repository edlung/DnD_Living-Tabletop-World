import type { ChronicleChapterView, ChronicleEntryView, ChronicleSourceView } from '@ltw/contracts';

import type { RecordedEvent } from '../kernel/events.ts';
import { effectiveEvents } from '../kernel/projections/world-view.ts';
import type { WorldState } from '../kernel/state.ts';
import type { ResolvedPerspective } from '../knowledge/perspective.ts';
import { entityRef } from '../knowledge/projection.ts';
import type { ChronicleRecord, StoredEntry } from './records.ts';

/**
 * Reading chapters (docs/adr/0024-chronicle.md §5). A perspective reads the
 * chapters told from it; the DM reads all. Every entry's sources resolve to
 * the effective events that recorded what it tells: the memory, the
 * knowledge it cites, or the event itself. Players get event IDs and types;
 * the DM also gets sequences and the rendering's trace.
 */
export interface SourceIndex {
  readonly memory: ReadonlyMap<string, RecordedEvent>;
  readonly knowledge: ReadonlyMap<string, RecordedEvent>;
  readonly event: ReadonlyMap<string, RecordedEvent>;
}

export const eventKey = (commandId: string, index: number) => `${commandId}#${String(index)}`;

export function sourceIndex(state: WorldState, history: readonly RecordedEvent[]): SourceIndex {
  const memory = new Map<string, RecordedEvent>();
  const knowledge = new Map<string, RecordedEvent>();
  const event = new Map<string, RecordedEvent>();
  const indexes = new Map<string, number>();
  for (const recorded of effectiveEvents(history, state)) {
    const { commandId } = recorded.causation;
    const index = indexes.get(commandId) ?? 0;
    indexes.set(commandId, index + 1);
    event.set(eventKey(commandId, index), recorded);
    if (recorded.type === 'MemoryRecorded') memory.set(recorded.payload.memoryId, recorded);
    if (recorded.type === 'KnowledgeAssigned')
      knowledge.set(recorded.payload.knowledgeId, recorded);
  }
  return { memory, knowledge, event };
}

export function sourcesOf(
  index: SourceIndex,
  dm: boolean,
  cited: {
    readonly memoryId?: string | null;
    readonly event?: { readonly commandId: string; readonly index: number } | null;
    readonly knowledgeIds: readonly string[];
  },
): ChronicleSourceView[] {
  const found = [
    cited.memoryId ? index.memory.get(cited.memoryId) : undefined,
    cited.event ? index.event.get(eventKey(cited.event.commandId, cited.event.index)) : undefined,
    ...cited.knowledgeIds.map((id) => index.knowledge.get(id)),
  ].filter((event): event is RecordedEvent => event !== undefined);
  return [...new Map(found.map((event) => [event.eventId, event])).values()].map((event) => ({
    eventId: event.eventId,
    eventType: event.type,
    ...(dm ? { sequence: event.sequence } : {}),
  }));
}

function entryView(
  state: WorldState,
  index: SourceIndex,
  dm: boolean,
  entry: StoredEntry,
): ChronicleEntryView {
  const ref = (id: string) => (state.entities.has(id) ? [entityRef(state, id)] : []);
  return {
    key: entry.key,
    occurredAt: entry.occurredAt,
    text: entry.text,
    salience: entry.salience,
    memoryId: entry.source.kind === 'memory' ? entry.source.memoryId : null,
    memoryKind: entry.memoryKind,
    eventType: entry.source.kind === 'event' ? entry.source.eventType : null,
    location: entry.locationId === null ? null : (ref(entry.locationId)[0] ?? null),
    participants: entry.participants.flatMap(ref),
    knowledge: entry.knowledge.map((known) => ({ ...known })),
    sources: sourcesOf(index, dm, {
      memoryId: entry.source.kind === 'memory' ? entry.source.memoryId : null,
      event: entry.source.kind === 'event' ? entry.source : null,
      knowledgeIds: entry.knowledge.map(({ knowledgeId }) => knowledgeId),
    }),
  };
}

export function chapterView(
  state: WorldState,
  index: SourceIndex,
  dm: boolean,
  record: ChronicleRecord,
): ChronicleChapterView {
  return {
    chronicleId: record.chronicleId,
    title: record.title,
    perspective: record.perspective,
    from: record.from,
    to: record.to,
    generatedAt: record.generatedAt,
    entries: record.entries.map((entry) => entryView(state, index, dm, entry)),
    prose: {
      provider: record.prose.provider,
      model: record.prose.model,
      traceId: dm ? record.prose.traceId : null,
      paragraphs: record.prose.paragraphs.map(({ text, cites }) => ({ text, cites: [...cites] })),
    },
  };
}

/** The chapters a perspective may read, in the order they were generated. */
export function chronicleChapters(
  snapshot: { readonly state: WorldState; readonly history: readonly RecordedEvent[] },
  perspective: ResolvedPerspective,
): ChronicleChapterView[] {
  const { state, history } = snapshot;
  const dm = perspective.scopes === 'ALL';
  const index = sourceIndex(state, history);
  return [...state.chronicles.values()]
    .filter((record) => dm || record.perspective === perspective.label)
    .map((record) => chapterView(state, index, dm, record));
}
