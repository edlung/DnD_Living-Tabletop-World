import type {
  CampaignEnding,
  ChronicleChapterView,
  EntityRef,
  HandoutView,
  KeepsakeView,
  ReflectionView,
  SessionReflections,
  SessionView,
} from '@ltw/contracts';

import { PARTY } from '../book-chapters.ts';
import { mainPlace, peopleMet } from '../chapter-facts.ts';

/*
 * The book of the campaign (docs/adr/0072-keepsakes.md §1) as its page lays it out: a cover, the
 * party's chapters in the order they were written — each with its evening's date, its place, the
 * faces met and the evening's stars — a gallery, and an ending. Assembled from what the PARTY
 * perspective reads and nothing else: a chapter told from anyone but the Party is left out here
 * too, whatever the lists hold.
 */

/** Something pictured as the party saw it at a world time. */
export interface Pictured {
  readonly entity: EntityRef;
  readonly at: number;
}

export interface BookEvening {
  readonly chapter: ChronicleChapterView;
  /** The real day the table sat down to it; null for a chapter that names no session. */
  readonly playedOn: string | null;
  readonly place: EntityRef | null;
  readonly people: readonly EntityRef[];
  /** The evening's stars, under the last chapter of its session. */
  readonly stars: readonly ReflectionView[];
}

export interface KeepsakeBook {
  readonly heroes: readonly EntityRef[];
  /** The first and the last evening told, and how many evenings there were. */
  readonly played: { readonly from: string; readonly to: string; readonly evenings: number } | null;
  readonly evenings: readonly BookEvening[];
  readonly places: readonly Pictured[];
  readonly faces: readonly Pictured[];
  readonly handouts: readonly HandoutView[];
  /** The adventure's end (ADR 0072 §2): "The end" and the DM's last words; null, "To be continued". */
  readonly ending: CampaignEnding | null;
  /** What the heroes keep, as the whole table reads it. */
  readonly keepsakes: readonly KeepsakeView[];
}

const LONG_EVENING_MS = 12 * 3_600_000;

/**
 * The instant that stands for an evening's day: when it started — an evening that runs past
 * midnight keeps its day — unless it stayed open longer than an evening lasts (a campaign from a
 * ready adventure starts with its first session open, days before the table sits down; a session
 * nobody closed): then the day it was closed, which is when the table was there.
 */
export function eveningInstant(session: SessionView): string {
  const from = Date.parse(session.playedFrom);
  const to = session.playedTo === null ? Number.NaN : Date.parse(session.playedTo);
  return session.playedTo !== null && to - from > LONG_EVENING_MS
    ? session.playedTo
    : session.playedFrom;
}

/** Each entity once, in the order first told, pictured at the latest chapter that tells of it. */
function pictured(
  chapters: readonly ChronicleChapterView[],
  of: (chapter: ChronicleChapterView) => readonly EntityRef[],
): readonly Pictured[] {
  const found = new Map<string, Pictured>();
  for (const chapter of chapters) {
    for (const entity of of(chapter)) {
      // A Map keeps the place of a key set again: the first telling's order, the last one's time.
      found.set(entity.entityId, { entity, at: chapter.to });
    }
  }
  return [...found.values()];
}

const placesOf = (chapter: ChronicleChapterView): readonly EntityRef[] =>
  chapter.entries.flatMap((entry) => (entry.location ? [entry.location] : []));

export function assembleBook(read: {
  readonly chapters: readonly ChronicleChapterView[];
  readonly sessions: readonly SessionView[];
  readonly reflections: readonly SessionReflections[];
  readonly handouts: readonly HandoutView[];
  readonly entities: readonly EntityRef[];
  readonly ending?: CampaignEnding | null;
  readonly keepsakes?: readonly KeepsakeView[];
}): KeepsakeBook {
  const chapters = read.chapters.filter((chapter) => chapter.perspective === PARTY);
  const sessions = new Map(read.sessions.map((session) => [session.sessionId, session]));
  const stars = new Map(
    read.reflections.map((session) => [
      session.sessionId,
      session.entries.filter((entry) => entry.star !== ''),
    ]),
  );
  const lastOf = new Map<string, string>();
  for (const chapter of chapters) {
    if (chapter.sessionId !== null) lastOf.set(chapter.sessionId, chapter.chronicleId);
  }
  const evenings = chapters.map((chapter): BookEvening => {
    const { sessionId } = chapter;
    const session = sessionId === null ? undefined : sessions.get(sessionId);
    const closes = sessionId !== null && lastOf.get(sessionId) === chapter.chronicleId;
    return {
      chapter,
      playedOn: session ? eveningInstant(session) : null,
      place: mainPlace(chapter),
      people: peopleMet(chapter),
      stars: closes ? (stars.get(sessionId) ?? []) : [],
    };
  });
  const days = [
    ...new Map(
      evenings.flatMap((evening) =>
        evening.playedOn !== null && evening.chapter.sessionId !== null
          ? [[evening.chapter.sessionId, evening.playedOn] as const]
          : [],
      ),
    ).values(),
  ].sort((a, b) => Date.parse(a) - Date.parse(b));
  const first = days[0];
  const last = days.at(-1);
  return {
    heroes: read.entities.filter((entity) => entity.kind === 'character'),
    played:
      first === undefined || last === undefined
        ? null
        : { from: first, to: last, evenings: days.length },
    evenings,
    places: pictured(chapters, placesOf),
    faces: pictured(chapters, peopleMet),
    handouts: read.handouts.filter((handout) => handout.to === 'party'),
    ending: read.ending ?? null,
    keepsakes: read.keepsakes ?? [],
  };
}

/** A day in full, in the reader's language, habits and time zone: "Saturday, 14 November 2026". */
export const dayWords = (instant: string, locale: string): string =>
  new Intl.DateTimeFormat(locale, { dateStyle: 'full' })
    .format(new Date(instant))
    // Russian ends a full date in "г.", which a heading set in capitals does not want.
    .replace(/\s*г\.$/, '');

/** A day in short, beside a chapter's title in the contents: "14 November". */
export const shortDayWords = (instant: string, locale: string): string =>
  new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long' }).format(new Date(instant));

/** The days played, for the cover: one day, or the first and the last. */
export function playedWords(
  played: NonNullable<KeepsakeBook['played']>,
  locale: string,
): { readonly from: string; readonly to: string | null } {
  const day = new Intl.DateTimeFormat(locale, { dateStyle: 'long' });
  const from = day.format(new Date(played.from));
  const to = day.format(new Date(played.to));
  return { from, to: to === from ? null : to };
}
