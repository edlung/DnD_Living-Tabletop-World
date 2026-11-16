import type {
  ChronicleChapterView,
  ChronicleEntryView,
  EntityRef,
  HandoutView,
  ReflectionView,
  SessionView,
} from '@ltw/contracts';
import { describe, expect, it } from 'vitest';

import {
  assembleBook,
  dayWords,
  eveningInstant,
  playedWords,
  shortDayWords,
} from './book-model.ts';

const ref = (entityId: string, kind: EntityRef['kind']): EntityRef => ({
  entityId,
  kind,
  name: entityId,
});
const GATE = ref('north-gate', 'location');
const INN = ref('inn', 'location');
const MIRA = ref('mira', 'npc');
const WOLF = ref('wolf', 'creature');
const ELOWEN = ref('elowen', 'character');

const entry = (
  key: string,
  location: EntityRef | null,
  participants: readonly EntityRef[] = [],
): ChronicleEntryView => ({
  key,
  occurredAt: 0,
  text: key,
  salience: 3,
  memoryId: key,
  memoryKind: 'OBSERVATION',
  eventType: null,
  location,
  participants,
  knowledge: [],
  sources: [],
});

const chapter = (
  chronicleId: string,
  to: number,
  sessionId: string | null,
  entries: readonly ChronicleEntryView[] = [],
  perspective = 'PARTY',
): ChronicleChapterView => ({
  chronicleId,
  title: chronicleId,
  perspective,
  from: 0,
  to,
  sessionId,
  generatedAt: to,
  entries,
  prose: { provider: 'template', model: 'm', traceId: null, paragraphs: [] },
});

const session = (sessionId: string, playedFrom: string, playedTo: string | null): SessionView => ({
  sessionId,
  title: sessionId,
  startedAt: 0,
  endedAt: playedTo === null ? null : 0,
  playedFrom,
  playedTo,
});

const star = (name: string | null, words: string): ReflectionView => ({
  author: name === null ? null : { entityId: name, name },
  star: words,
  wish: null,
  own: false,
});

const NOTHING = { sessions: [], reflections: [], handouts: [], entities: [] };

describe('the day an evening stands for', () => {
  it('is the day it started, also when it ran past midnight', () => {
    expect(
      eveningInstant(session('s', '2026-11-14T18:00:00.000Z', '2026-11-15T00:40:00.000Z')),
    ).toBe('2026-11-14T18:00:00.000Z');
    expect(eveningInstant(session('s', '2026-11-14T18:00:00.000Z', null))).toBe(
      '2026-11-14T18:00:00.000Z',
    );
  });

  it('is the day it was closed when it stood open longer than an evening lasts', () => {
    // A campaign from a ready adventure: its first session opens with the campaign.
    expect(
      eveningInstant(session('s', '2026-11-08T10:00:00.000Z', '2026-11-14T21:30:00.000Z')),
    ).toBe('2026-11-14T21:30:00.000Z');
  });
});

describe('the book of the campaign', () => {
  it('holds the party’s chapters only, whatever the lists hold', () => {
    const book = assembleBook({
      ...NOTHING,
      chapters: [
        chapter('party-1', 100, null),
        chapter('the-dm-s', 150, null, [], 'DM'),
        chapter('elowen-s', 160, null, [], 'CHARACTER:elowen'),
        chapter('party-2', 200, null),
      ],
    });
    expect(book.evenings.map((evening) => evening.chapter.chronicleId)).toEqual([
      'party-1',
      'party-2',
    ]);
  });

  it('gives a chapter its evening’s day, its place, the faces met and the stars', () => {
    const book = assembleBook({
      ...NOTHING,
      chapters: [
        chapter('one', 100, 's1', [
          entry('a', GATE, [ELOWEN, MIRA]),
          entry('b', GATE, [WOLF, MIRA]),
          entry('c', INN),
        ]),
      ],
      sessions: [session('s1', '2026-11-14T18:00:00.000Z', '2026-11-14T21:30:00.000Z')],
      reflections: [
        {
          sessionId: 's1',
          title: 's1',
          open: false,
          // A wish alone holds no star: it is not the book's.
          entries: [star('brann', 'Brann held the bridge.'), star('elowen', '')],
        },
      ],
    });
    const [evening] = book.evenings;
    expect(evening?.playedOn).toBe('2026-11-14T18:00:00.000Z');
    expect(evening?.place).toEqual(GATE);
    // Those met, not the party that tells the chapter.
    expect(evening?.people).toEqual([MIRA, WOLF]);
    expect(evening?.stars.map((entry) => entry.star)).toEqual(['Brann held the bridge.']);
  });

  it('puts an evening’s stars under the last chapter of its session, once', () => {
    const book = assembleBook({
      ...NOTHING,
      chapters: [
        chapter('first', 100, 's1'),
        chapter('again', 100, 's1'),
        chapter('free', 200, null),
      ],
      sessions: [session('s1', '2026-11-14T18:00:00.000Z', '2026-11-14T21:30:00.000Z')],
      reflections: [
        { sessionId: 's1', title: 's1', open: false, entries: [star(null, 'All of it.')] },
      ],
    });
    expect(book.evenings.map((evening) => evening.stars.length)).toEqual([0, 1, 0]);
    // A chapter that names no session has no day.
    expect(book.evenings.map((evening) => evening.playedOn !== null)).toEqual([true, true, false]);
  });

  it('counts the evenings told and names the first and the last', () => {
    const book = assembleBook({
      ...NOTHING,
      chapters: [
        chapter('two', 200, 's2'),
        chapter('one', 100, 's1'),
        chapter('one-again', 100, 's1'),
      ],
      sessions: [
        session('s1', '2026-11-14T18:00:00.000Z', '2026-11-14T21:30:00.000Z'),
        session('s2', '2026-11-21T18:00:00.000Z', '2026-11-21T21:30:00.000Z'),
        // An evening with no chapter is not told, so not counted.
        session('s3', '2026-11-28T18:00:00.000Z', '2026-11-28T21:30:00.000Z'),
      ],
    });
    expect(book.played).toEqual({
      from: '2026-11-14T18:00:00.000Z',
      to: '2026-11-21T18:00:00.000Z',
      evenings: 2,
    });
    expect(assembleBook({ ...NOTHING, chapters: [chapter('free', 1, null)] }).played).toBeNull();
  });

  it('pictures each place and face once, as the party saw it at the last telling', () => {
    const book = assembleBook({
      ...NOTHING,
      chapters: [
        chapter('one', 100, null, [entry('a', GATE, [MIRA]), entry('b', INN, [ELOWEN])]),
        chapter('two', 200, null, [entry('c', GATE, [WOLF, MIRA]), entry('d', null)]),
      ],
    });
    expect(book.places).toEqual([
      { entity: GATE, at: 200 },
      { entity: INN, at: 100 },
    ]);
    expect(book.faces).toEqual([
      { entity: MIRA, at: 200 },
      { entity: WOLF, at: 200 },
    ]);
  });

  it('lists the heroes and what was shown to the party, never a handout for one', () => {
    const handout = (handoutId: string, to: HandoutView['to']): HandoutView => ({
      handoutId,
      title: handoutId,
      text: 'A letter.',
      picture: null,
      to,
      at: '2026-11-14T19:00:00.000Z',
    });
    const book = assembleBook({
      ...NOTHING,
      chapters: [],
      entities: [ELOWEN, GATE, MIRA],
      handouts: [
        handout('for-all', 'party'),
        handout('for-one', { entityId: 'elowen', name: 'e' }),
      ],
    });
    expect(book.heroes).toEqual([ELOWEN]);
    expect(book.handouts.map((one) => one.handoutId)).toEqual(['for-all']);
    expect(book.ending).toBeNull();
    expect(book.keepsakes).toEqual([]);
  });
});

describe('the book’s dates in words', () => {
  it('writes a day in full in the reader’s language', () => {
    // (The comma after the weekday comes and goes with the runtime's locale data.)
    expect(dayWords('2026-11-14T12:00:00.000Z', 'en-GB')).toMatch(/^Saturday,? 14 November 2026$/);
    expect(dayWords('2026-11-14T12:00:00.000Z', 'ru')).toBe('суббота, 14 ноября 2026');
    expect(shortDayWords('2026-11-14T12:00:00.000Z', 'ru')).toBe('14 ноября');
    expect(shortDayWords('2026-11-14T12:00:00.000Z', 'en-GB')).toBe('14 November');
  });

  it('names one day played, or the first and the last', () => {
    const played = {
      from: '2026-11-14T12:00:00.000Z',
      to: '2026-11-21T12:00:00.000Z',
      evenings: 2,
    };
    expect(playedWords(played, 'en-GB')).toEqual({
      from: '14 November 2026',
      to: '21 November 2026',
    });
    expect(playedWords({ ...played, to: '2026-11-14T13:00:00.000Z' }, 'en-GB')).toEqual({
      from: '14 November 2026',
      to: null,
    });
  });
});
