import type {
  ChronicleChapterView,
  ChronicleEntryView,
  ChronicleKnowledgeView,
  ChronicleParagraph,
  EntityRef,
} from '@ltw/contracts';
import type { Translate } from '@ltw/ui';

/*
 * What the Chronicle's pages show of a chapter (docs/STAGE_320_DESIGN.md §5.6), read from the
 * chapter as the server supplied it: nothing is rewritten or inferred. Entries keep their
 * order (world time), records and people are listed once each, in the order first told.
 */

/** The place most of the chapter's entries happen at (the first told on a tie), or null. */
export function mainPlace(chapter: ChronicleChapterView): EntityRef | null {
  const counts = new Map<string, { readonly place: EntityRef; count: number }>();
  for (const entry of chapter.entries) {
    if (!entry.location) continue;
    const known = counts.get(entry.location.entityId);
    if (known) known.count += 1;
    else counts.set(entry.location.entityId, { place: entry.location, count: 1 });
  }
  let best: { readonly place: EntityRef; count: number } | null = null;
  for (const candidate of counts.values()) {
    if (best === null || candidate.count > best.count) best = candidate;
  }
  return best?.place ?? null;
}

/** The people the entries name, once each: those met, not the party that tells the chapter. */
export function peopleMet(chapter: ChronicleChapterView): readonly EntityRef[] {
  const people = new Map<string, EntityRef>();
  for (const entry of chapter.entries) {
    for (const who of entry.participants) {
      if ((who.kind === 'npc' || who.kind === 'creature') && !people.has(who.entityId)) {
        people.set(who.entityId, who);
      }
    }
  }
  return [...people.values()];
}

/** Every record the entries rest on, once each, with its epistemic type. */
export function learned(chapter: ChronicleChapterView): readonly ChronicleKnowledgeView[] {
  const records = new Map<string, ChronicleKnowledgeView>();
  for (const entry of chapter.entries) {
    for (const record of entry.knowledge) {
      if (!records.has(record.knowledgeId)) records.set(record.knowledgeId, record);
    }
  }
  return [...records.values()];
}

/** The entries a paragraph cites, in its order; a key the chapter does not hold is skipped. */
export function citedEntries(
  chapter: ChronicleChapterView,
  paragraph: ChronicleParagraph,
): readonly ChronicleEntryView[] {
  const entries = new Map(chapter.entries.map((entry) => [entry.key, entry]));
  return paragraph.cites.flatMap((key) => entries.get(key) ?? []);
}

/** The events a source names, as a reader says them (an English key the dictionary translates). */
const EVENT_WORDS: Readonly<Record<string, string>> = {
  MemoryRecorded: 'a memory recorded',
  KnowledgeAssigned: 'a record of what was known',
  EntityStatusChanged: 'a change of state',
  CombatStarted: 'a fight beginning',
  CombatEnded: 'a fight ending',
  ReactionUsed: 'a reaction',
  ContradictionDetected: 'a contradiction found',
  InformationShared: 'information shared',
  EvidenceExamined: 'an examination',
  WorldTimeAdvanced: 'time passing',
  EntityPlaced: 'a move',
  EntityCreated: 'someone new in the world',
};

/** A source's event type in words (its type's own words when the client has none). */
export const eventWords = (eventType: string): string =>
  EVENT_WORDS[eventType] ?? eventType.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();

/**
 * Who a chapter is told from (the DM reads every perspective's chapters): the party, the
 * public, the DM, or a character or NPC by name — never a perspective's ID.
 */
export function toldFrom(
  t: Translate,
  perspective: string,
  names: ReadonlyMap<string, string>,
): string {
  if (perspective === 'PARTY') return t('the party');
  if (perspective === 'PUBLIC') return t('the public');
  if (perspective === 'DM') return t('the DM');
  const [, id = ''] = perspective.split(':');
  return names.get(id) ?? t('another perspective');
}

/** The prose's teller in words: the plain record (the template) or the narrator. */
export const proseTeller = (provider: string): string =>
  provider === 'template' ? 'Told as the plain record' : 'Told by the narrator';
