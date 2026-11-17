import type { ChronicleChapterView, SessionView } from '@ltw/contracts';
import { describe, expect, it } from 'vitest';

import {
  ALL_TIME,
  bookChapters,
  chapterSpan,
  chapterTitle,
  lastSession,
  newestPartyChapter,
  recapParagraphs,
  sessionChapter,
} from './book-chapters.ts';

const chapter = (
  chronicleId: string,
  perspective: string,
  generatedAt: number,
  paragraphs: readonly string[] = ['One.'],
): ChronicleChapterView => ({
  chronicleId,
  title: chronicleId,
  perspective,
  from: 0,
  to: generatedAt,
  sessionId: null,
  generatedAt,
  entries: [],
  prose: {
    provider: 'template',
    model: 'chronicle-template-1',
    traceId: null,
    paragraphs: paragraphs.map((text) => ({ text, cites: ['e1'] })),
  },
});

const ids = (book: ReturnType<typeof bookChapters>) =>
  book.map((entry) => `${entry.chapter.chronicleId}${entry.party ? '*' : ''}`);

describe('the chapters of a member’s book', () => {
  const mine = 'CHARACTER:elowen-starwhisper';

  it('holds the reader’s own chapters and the party’s, in the order they were written', () => {
    const own = [chapter('mine-1', mine, 100), chapter('mine-2', mine, 300)];
    const party = [chapter('party-1', 'PARTY', 200), chapter('party-2', 'PARTY', 400)];
    expect(ids(bookChapters(own, party))).toEqual(['mine-1', 'party-1*', 'mine-2', 'party-2*']);
  });

  it('puts the party’s chapter first when both were written at one world time', () => {
    const own = [chapter('mine-1', mine, 100)];
    const party = [chapter('party-1', 'PARTY', 100)];
    expect(ids(bookChapters(own, party))).toEqual(['party-1*', 'mine-1']);
  });

  it('shows a chapter once when the reader’s view is the party’s', () => {
    const party = [chapter('party-1', 'PARTY', 100), chapter('party-2', 'PARTY', 200)];
    expect(ids(bookChapters(party, party))).toEqual(['party-1*', 'party-2*']);
  });

  it('is the reader’s own book when the party has none, and the party’s when the reader has none', () => {
    const own = [chapter('mine-1', mine, 100)];
    expect(ids(bookChapters(own, []))).toEqual(['mine-1']);
    expect(ids(bookChapters([], [chapter('party-1', 'PARTY', 100)]))).toEqual(['party-1*']);
  });

  it('never marks a chapter told from the DM as the party’s', () => {
    const dm = [chapter('dm-1', 'DM', 100), chapter('party-1', 'PARTY', 200)];
    expect(ids(bookChapters(dm, []))).toEqual(['dm-1', 'party-1*']);
  });
});

describe('“Previously…”', () => {
  it('is the newest chapter told from the Party, never another view’s', () => {
    const chapters = [
      chapter('party-1', 'PARTY', 100),
      chapter('party-2', 'PARTY', 200),
      chapter('dm-1', 'DM', 300),
    ];
    expect(newestPartyChapter(chapters)?.chronicleId).toBe('party-2');
    expect(newestPartyChapter([chapter('dm-1', 'DM', 300)])).toBeNull();
    expect(newestPartyChapter([])).toBeNull();
  });

  it('shows three passages as written, in order: the most salient moments, the later among equals', () => {
    const entry = (key: string, salience: number) => ({
      key,
      occurredAt: 0,
      text: key,
      salience,
      memoryId: null,
      memoryKind: null,
      eventType: null,
      location: null,
      participants: [],
      knowledge: [],
      sources: [],
    });
    const told: ChronicleChapterView = {
      ...chapter('party-1', 'PARTY', 100),
      entries: [entry('e1', 3), entry('e2', 4), entry('e3', 3), entry('e4', 3), entry('e5', 5)],
      prose: {
        provider: 'template',
        model: 'chronicle-template-1',
        traceId: null,
        paragraphs: ['One.', 'Two.', 'Three.', 'Four.', 'Five.'].map((text, index) => ({
          text,
          cites: [`e${String(index + 1)}`],
        })),
      },
    };
    // The fight (4) and the DM's line (5), then the latest of the rest; told in the chapter's order.
    expect(recapParagraphs(told)).toEqual(['Two.', 'Four.', 'Five.']);
    // A short chapter is shown whole.
    expect(recapParagraphs(chapter('party-2', 'PARTY', 100, ['One.', 'Two.']))).toEqual([
      'One.',
      'Two.',
    ]);
  });
});

describe('a session as a chapter', () => {
  const session = (sessionId: string, startedAt: number, endedAt: number | null): SessionView => ({
    sessionId,
    title: sessionId,
    startedAt,
    endedAt,
    playedFrom: '2026-11-14T18:00:00.000Z',
    playedTo: endedAt === null ? null : '2026-11-14T21:30:00.000Z',
  });

  it('offers the open session, else the last one started', () => {
    const ended = [session('one', 0, 100), session('two', 100, 250)];
    expect(lastSession(ended)?.sessionId).toBe('two');
    expect(lastSession([...ended, session('three', 250, null)])?.sessionId).toBe('three');
    expect(lastSession([])).toBeNull();
  });

  it('tells the session itself, over all of time up to its end, or to now while it is open', () => {
    expect(sessionChapter(session('two', 100, 250))).toEqual({
      sessionId: 'two',
      from: ALL_TIME,
      to: 250,
    });
    expect(sessionChapter(session('three', 250, null))).toEqual({
      sessionId: 'three',
      from: ALL_TIME,
    });
  });

  it('heads a session’s chapter with the span of its own moments, another with its window', () => {
    const moment = (occurredAt: number) => ({
      key: `e${String(occurredAt)}`,
      occurredAt,
      text: 'A moment.',
      salience: 3,
      memoryId: null,
      memoryKind: null,
      eventType: null,
      location: null,
      participants: [],
      knowledge: [],
      sources: [],
    });
    const told = { ...chapter('party-1', 'PARTY', 500), from: ALL_TIME, to: 500 };
    expect(chapterSpan({ ...told, sessionId: 'two', entries: [moment(300), moment(120)] })).toEqual(
      { from: 120, to: 300 },
    );
    expect(chapterSpan({ ...told, from: 0, entries: [moment(300)] })).toEqual({ from: 0, to: 500 });
  });

  it('cuts a long session title to a chapter’s length', () => {
    expect(chapterTitle('  Session 3  ')).toBe('Session 3');
    expect(chapterTitle('x'.repeat(200))).toHaveLength(120);
  });
});
