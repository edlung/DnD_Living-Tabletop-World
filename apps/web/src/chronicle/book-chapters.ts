import {
  CHRONICLE_LIMITS,
  MAX_ABS_WORLD_TIME,
  type ChronicleChapterView,
  type SessionView,
} from '@ltw/contracts';

/**
 * The chapters of a member's book (docs/adr/0071-memory-and-ritual.md §1): those told from the
 * reader's own perspective and those told from the Party, which every player may read as PARTY.
 * A party chapter's pages are read as PARTY too, whoever opens them.
 */
export const PARTY = 'PARTY';

export interface BookChapter {
  readonly chapter: ChronicleChapterView;
  /** Read in the party's view: its pictures, faces and flashbacks are read there too. */
  readonly party: boolean;
}

/**
 * The reader's own chapters and the party's as one book, in the order they were written (both
 * lists come in that order; `generatedAt` is the world time of writing, so equal times keep each
 * list's order and put the party's first). A chapter in both lists shows once.
 */
export function bookChapters(
  own: readonly ChronicleChapterView[],
  party: readonly ChronicleChapterView[],
): readonly BookChapter[] {
  const ownIds = new Set(own.map((chapter) => chapter.chronicleId));
  const others = party.filter((chapter) => !ownIds.has(chapter.chronicleId));
  const book: BookChapter[] = [];
  const waiting = [...others];
  for (const chapter of own) {
    for (
      let head = waiting[0];
      head !== undefined && head.generatedAt <= chapter.generatedAt;
      head = waiting[0]
    ) {
      book.push({ chapter: head, party: true });
      waiting.shift();
    }
    book.push({ chapter, party: chapter.perspective === PARTY });
  }
  for (const chapter of waiting) book.push({ chapter, party: true });
  return book;
}

/** The newest chapter told from the Party: what "Previously…" shows. */
export const newestPartyChapter = (
  chapters: readonly ChronicleChapterView[],
): ChronicleChapterView | null =>
  chapters.findLast((chapter) => chapter.perspective === PARTY) ?? null;

/** The session a chapter is offered for: the open one, else the last that was started. */
export const lastSession = (sessions: readonly SessionView[]): SessionView | null =>
  sessions.find((session) => session.endedAt === null) ?? sessions.at(-1) ?? null;

/** The whole of world time: a session's chapter is cut by its session, not by a window. */
export const ALL_TIME = -MAX_ABS_WORLD_TIME;

/**
 * A session's chapter (ADR 0071 §1.2): the session itself — the world's clock often stands still
 * from one evening to the next, and a memory kept in a session may be of an earlier hour, so only
 * the session tells what belongs to it. The window is everything up to the session's end, or to
 * now (no `to`: the server takes the clock) while it is open.
 */
export function sessionChapter(session: SessionView): {
  readonly sessionId: string;
  readonly from: number;
  readonly to?: number;
} {
  return session.endedAt === null
    ? { sessionId: session.sessionId, from: ALL_TIME }
    : { sessionId: session.sessionId, from: ALL_TIME, to: session.endedAt };
}

/**
 * The span a chapter tells, for its heading: a session's chapter spans its own moments (its
 * window is all of time), any other its window.
 */
export function chapterSpan(chapter: ChronicleChapterView): {
  readonly from: number;
  readonly to: number;
} {
  const times = chapter.entries.map((entry) => entry.occurredAt);
  return chapter.sessionId === null || times.length === 0
    ? { from: chapter.from, to: chapter.to }
    : { from: Math.min(...times), to: Math.max(...times) };
}

/** A session's title as a chapter's: a chapter's title is shorter than a session's may be. */
export const chapterTitle = (title: string): string =>
  title.trim().slice(0, CHRONICLE_LIMITS.titleChars).trim();

/**
 * The recap's passages (ADR 0071 §1.4): at most three of the chapter's paragraphs, exactly as
 * written and in the chapter's order — those that tell its most salient moments, the later first
 * among equals, since a recap says where the table left off. The DM's own line at the evening's
 * close is recorded as most salient, so it is always among them.
 */
export const RECAP_PARAGRAPHS = 3;
export function recapParagraphs(chapter: ChronicleChapterView): readonly string[] {
  const salience = new Map(chapter.entries.map((entry) => [entry.key, entry.salience]));
  return chapter.prose.paragraphs
    .map((paragraph, index) => ({
      index,
      text: paragraph.text,
      weight: Math.max(0, ...paragraph.cites.map((key) => salience.get(key) ?? 0)),
    }))
    .sort((a, b) => b.weight - a.weight || b.index - a.index)
    .slice(0, RECAP_PARAGRAPHS)
    .sort((a, b) => a.index - b.index)
    .map((passage) => passage.text);
}
