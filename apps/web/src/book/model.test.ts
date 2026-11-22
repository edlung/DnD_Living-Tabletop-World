import { campaignBookSchema, EMPTY_BOOK_PLACE, type CampaignBook } from '@ltw/contracts';
import { describe, expect, it } from 'vitest';

import {
  leafAt,
  leavesOf,
  pathOf,
  placeAfterTurn,
  placeWithChapter,
  placeWithNote,
  placeWithRibbon,
  platesFor,
  runsOf,
} from './model.ts';

const page = (key: string, text = 'Текст.', extra: Record<string, unknown> = {}) => ({
  key,
  title: key,
  text,
  voice: 'dm',
  layer: 1,
  choices: [],
  check: { line: '', roll: 'unread', options: [] },
  failForward: '',
  people: [],
  ...extra,
});
const chapter = (
  key: string,
  number: number,
  place: string,
  pages: unknown[],
  clues: string[] = [],
) => ({
  key,
  number,
  title: key,
  place,
  goal: 'Цель.',
  readAloud: 'Слова вслух.',
  dmNote: '',
  people: [],
  clues,
  handouts: [],
  encounters: [],
  pages,
  spotlight: [],
  reward: [],
  ending: '',
  consequences: [],
  guide: [],
});
const book: CampaignBook = campaignBookSchema.parse({
  schemaVersion: 1,
  title: 'Маяк',
  chapters: [
    chapter('home', 1, 'pier', [page('home-scene-1'), page('home-scene-2')], ['ticket']),
    chapter('isle', 2, 'isle', [page('isle-scene-1')]),
    chapter('reef', 3, 'reef', [page('reef-scene-1', 'Текст.', { place: 'cave' })]),
    chapter('end', 4, 'pier', [page('end-scene-1')]),
  ],
  people: [],
  clues: [
    {
      key: 'ticket',
      name: 'Билет',
      place: 'pier',
      appearance: '',
      statement: 'x',
      subjects: ['reef', 'pier'],
      discovery: '',
    },
    {
      key: 'chart',
      name: 'Карта рифа',
      place: 'reef',
      appearance: '',
      statement: 'x',
      subjects: [],
      discovery: '',
    },
  ],
  handouts: [],
  looseEncounters: [],
});
const leaves = leavesOf(book);
const at = (key: string) => {
  const leaf = leaves.find((l) => l.key === key);
  if (!leaf) throw new Error(key);
  return leaf;
};

describe('the leaves of a book', () => {
  it('opens each chapter with its words to read aloud, then its pages', () => {
    expect(leaves.map((l) => l.key)).toEqual([
      'home',
      'home-scene-1',
      'home-scene-2',
      'isle',
      'isle-scene-1',
      'reef',
      'reef-scene-1',
      'end',
      'end-scene-1',
    ]);
    expect(leafAt(leaves, 'isle')?.page).toBeNull();
    expect(leafAt(leaves, null)?.key).toBe('home');
    expect(leafAt(leaves, 'a-page-of-an-older-book')?.key).toBe('home');
  });
});

describe('the ribbon', () => {
  const start = { ...EMPTY_BOOK_PLACE, ribbon: 'home-scene-1' };

  it('follows the turn to the next page from where it lies', () => {
    expect(placeAfterTurn(start, leaves, at('home-scene-1'), at('home-scene-2')).ribbon).toBe(
      'home-scene-2',
    );
    expect(placeAfterTurn(EMPTY_BOOK_PLACE, leaves, at('home'), at('home-scene-1')).ribbon).toBe(
      'home-scene-1',
    );
  });

  it('stays when the DM reads ahead, turns back or opens another chapter', () => {
    expect(placeAfterTurn(start, leaves, at('home-scene-2'), at('isle'))).toBe(start);
    expect(placeAfterTurn(start, leaves, at('home-scene-1'), at('home'))).toBe(start);
    expect(placeAfterTurn(start, leaves, at('home-scene-1'), at('reef'))).toBe(start);
  });

  it('marks a chapter played when the turn leaves it, and only then', () => {
    const last = { ...EMPTY_BOOK_PLACE, ribbon: 'home-scene-2' };
    expect(placeAfterTurn(last, leaves, at('home-scene-2'), at('isle'))).toEqual({
      ribbon: 'isle',
      played: ['home'],
      notes: {},
    });
    expect(placeWithRibbon(last, at('reef')).played).toEqual([]);
    expect(placeWithChapter(placeWithChapter(last, 'isle', true), 'isle', false).played).toEqual(
      [],
    );
  });

  it('keeps a note on a page and forgets an emptied one', () => {
    const noted = placeWithNote(EMPTY_BOOK_PLACE, 'home', 'Спросить про билет');
    expect(noted.notes).toEqual({ home: 'Спросить про билет' });
    expect(placeWithNote(noted, 'home', '  ').notes).toEqual({});
  });
});

describe('the path through the chapters', () => {
  it('says where the party is, what is played, what is next and what a found clue opens', () => {
    const place = { ribbon: 'isle-scene-1', played: ['home'], notes: {} };
    const states = (found: string[]) =>
      pathOf(book, place, new Set(found)).map((stop) => [stop.chapter.key, stop.state, stop.clues]);
    expect(states([])).toEqual([
      ['home', 'played', []],
      ['isle', 'here', []],
      ['reef', 'next', []],
      ['end', 'later', []],
    ]);
    // The ticket is about the pier and the reef: it opens the last chapter, played at the pier
    // (the reef is next anyway), and never its own.
    expect(states(['ticket', 'chart'])).toEqual([
      ['home', 'played', []],
      ['isle', 'here', []],
      ['reef', 'next', []],
      ['end', 'open', ['Билет']],
    ]);
  });

  it('calls the first chapter the place of a book never opened', () => {
    expect(pathOf(book, EMPTY_BOOK_PLACE, new Set()).map((stop) => stop.state)).toEqual([
      'here',
      'next',
      'later',
      'later',
    ]);
  });
});

describe('the picture of a spread', () => {
  it('tries the moment, then the page’s own place, then the chapter’s', () => {
    expect(platesFor(at('reef-scene-1'), 'runa')).toEqual([
      { subject: 'runa', exactness: 'moment' },
      { subject: 'cave', exactness: 'place' },
      { subject: 'reef', exactness: 'chapter' },
    ]);
    expect(platesFor(at('home-scene-1'), null)).toEqual([{ subject: 'pier', exactness: 'place' }]);
    expect(platesFor(at('home'), 'pier')).toEqual([{ subject: 'pier', exactness: 'moment' }]);
  });
});

describe('a page’s text cut into runs', () => {
  const linked = campaignBookSchema.shape.chapters.element.shape.pages.element.parse(
    page('p', 'Руна ждёт. Рунами покрыта дверь. С Руной говорит смотритель Ильр.', {
      people: [
        { person: 'runa', words: ['Руна', 'Руной'] },
        { person: 'ilyr', words: ['Ильр'] },
      ],
      cues: [
        {
          key: 'door',
          kind: 'clue',
          title: 'Дверь',
          words: ['покрыта дверь'],
          brief: '',
          details: [],
        },
      ],
    }),
  );

  it('links whole words only, a longer form before a shorter', () => {
    expect(runsOf(linked, linked.text)).toEqual([
      { text: 'Руна', opens: { kind: 'person', key: 'runa' } },
      { text: ' ждёт. Рунами ' },
      { text: 'покрыта дверь', opens: { kind: 'cue', key: 'door' } },
      { text: '. С ' },
      { text: 'Руной', opens: { kind: 'person', key: 'runa' } },
      { text: ' говорит смотритель ' },
      { text: 'Ильр', opens: { kind: 'person', key: 'ilyr' } },
      { text: '.' },
    ]);
    expect(runsOf(linked, 'Ни одного имени.')).toEqual([{ text: 'Ни одного имени.' }]);
  });
});
