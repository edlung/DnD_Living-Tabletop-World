import type {
  ChronicleChapterView,
  EntityRef,
  KnowledgeType,
  KnowledgeView,
  QuestView,
} from '@ltw/contracts';

import { PARTY } from '../book-chapters.ts';

/*
 * The party's encyclopedia (docs/adr/0073-table-ideas.md §4): who the party has met, where it has
 * been and what it knows, gathered from what the PARTY perspective reads and nothing else — the
 * directory of what it knows, its knowledge records, its chapters and its quests. Nothing is
 * rewritten or inferred: a record keeps its epistemic type (a rumour stays a rumour), a chapter of
 * any other perspective is left out here too, whatever the lists hold.
 */

export interface KnownFact {
  readonly knowledgeId: string;
  readonly type: KnowledgeType;
  readonly statement: string;
}

/** A chapter of the party's that tells of something. */
export interface KnownChapter {
  readonly chronicleId: string;
  readonly title: string;
}

export interface KnownEntry {
  readonly entity: EntityRef;
  /** What the party knows of it, in the order it came to know. */
  readonly facts: readonly KnownFact[];
  /** The party's chapters that tell of it, in the order written. */
  readonly chapters: readonly KnownChapter[];
}

export interface KnownQuest {
  readonly questId: string;
  readonly title: string;
  readonly done: boolean;
  /** The last thing that happened in it, as the log says it; null for none. */
  readonly latest: string | null;
}

export interface KnownBook {
  readonly people: readonly KnownEntry[];
  readonly places: readonly KnownEntry[];
  /** Things, features of places and factions. */
  readonly things: readonly KnownEntry[];
  /** What the party knows that is about nobody and nowhere in particular. */
  readonly lore: readonly KnownFact[];
  readonly quests: readonly KnownQuest[];
  /** Whether there is anything at all to read. */
  readonly empty: boolean;
}

const factOf = (record: KnowledgeView): KnownFact => ({
  knowledgeId: record.knowledgeId,
  type: record.knowledgeType,
  statement: record.statement,
});

const byName = (a: KnownEntry, b: KnownEntry) =>
  a.entity.name.localeCompare(b.entity.name, undefined, { sensitivity: 'base' });

export function assembleKnown(read: {
  readonly entities: readonly EntityRef[];
  readonly knowledge: readonly KnowledgeView[];
  readonly chapters: readonly ChronicleChapterView[];
  readonly quests: readonly QuestView[];
}): KnownBook {
  // A secret is the DM's word for what nobody holds yet: it is in no party read, and is left out
  // here again should one ever be handed in.
  const knowledge = read.knowledge.filter((record) => record.knowledgeType !== 'SECRET');
  const chapters = read.chapters.filter((chapter) => chapter.perspective === PARTY);
  const told = new Map<string, KnownChapter[]>();
  for (const chapter of chapters) {
    const named = new Set<string>();
    for (const entry of chapter.entries) {
      if (entry.location) named.add(entry.location.entityId);
      for (const who of entry.participants) named.add(who.entityId);
    }
    for (const entityId of named) {
      const list = told.get(entityId) ?? [];
      list.push({ chronicleId: chapter.chronicleId, title: chapter.title });
      told.set(entityId, list);
    }
  }
  const entryOf = (entity: EntityRef): KnownEntry => ({
    entity,
    facts: knowledge
      .filter((record) => record.subjects.some((subject) => subject.entityId === entity.entityId))
      .map(factOf),
    chapters: told.get(entity.entityId) ?? [],
  });
  // Only what the party's directory lists: a name is never taken from a chapter or a record alone.
  const entries = read.entities.map(entryOf);
  const of = (...kinds: readonly EntityRef['kind'][]) =>
    entries.filter((entry) => kinds.includes(entry.entity.kind)).sort(byName);
  const people = of('npc', 'creature');
  const places = of('location');
  const things = of('item', 'feature', 'faction');
  const lore = knowledge.filter((record) => record.subjects.length === 0).map(factOf);
  const quests = read.quests.map((quest): KnownQuest => ({
    questId: quest.questId,
    title: quest.title,
    done: quest.status === 'completed',
    latest: quest.transitions.at(-1)?.summary ?? null,
  }));
  return {
    people,
    places,
    things,
    lore,
    quests,
    empty: people.length + places.length + things.length + lore.length + quests.length === 0,
  };
}

/** The entries whose name holds what was typed, whatever its case; all of them for nothing typed. */
export function matching(entries: readonly KnownEntry[], typed: string): readonly KnownEntry[] {
  const wanted = typed.trim().toLocaleLowerCase();
  return wanted === ''
    ? entries
    : entries.filter((entry) => entry.entity.name.toLocaleLowerCase().includes(wanted));
}
