import type { ChronicleChapterView, ChronicleEntryView, EntityRef } from '@ltw/contracts';
import { translate } from '@ltw/ui';
import { describe, expect, it } from 'vitest';

import '../i18n/ru-visual.ts';
import {
  citedEntries,
  eventWords,
  learned,
  mainPlace,
  peopleMet,
  proseTeller,
  toldFrom,
} from './chapter-facts.ts';

const place = (entityId: string, name: string): EntityRef => ({ entityId, kind: 'location', name });
const square = place('market-square', 'Market Square');
const gate = place('north-gate', 'North Gate');
const mira: EntityRef = { entityId: 'mira-vale', kind: 'npc', name: 'Mira Vale' };
const elowen: EntityRef = { entityId: 'elowen-starwhisper', kind: 'character', name: 'Elowen' };
const thorne: EntityRef = { entityId: 'captain-thorne', kind: 'npc', name: 'Captain Thorne' };

const entry = (key: string, over: Partial<ChronicleEntryView>): ChronicleEntryView => ({
  key,
  occurredAt: 0,
  text: `Entry ${key}`,
  salience: 3,
  memoryId: null,
  memoryKind: null,
  eventType: null,
  location: null,
  participants: [],
  knowledge: [],
  sources: [],
  ...over,
});

const chapter: ChronicleChapterView = {
  chronicleId: 'chapter-1',
  title: 'Chapter I',
  perspective: 'CHARACTER:elowen-starwhisper',
  from: 0,
  to: 36_000,
  generatedAt: 36_000,
  entries: [
    entry('e1', {
      location: gate,
      participants: [elowen, thorne],
      knowledge: [{ knowledgeId: 'k1', knowledgeType: 'TESTIMONY', statement: 'Left at dawn.' }],
    }),
    entry('e2', {
      location: square,
      participants: [elowen, mira],
      knowledge: [{ knowledgeId: 'k1', knowledgeType: 'TESTIMONY', statement: 'Left at dawn.' }],
    }),
    entry('e3', {
      location: square,
      participants: [mira],
      knowledge: [{ knowledgeId: 'k2', knowledgeType: 'RUMOR', statement: 'Goblins, they say.' }],
    }),
  ],
  prose: {
    provider: 'template',
    model: 'chronicle-template-1',
    traceId: null,
    paragraphs: [{ text: 'They spoke.', cites: ['e3', 'e9', 'e1'] }],
  },
};

const english = (key: string, params?: Readonly<Record<string, string | number>>) =>
  translate('en', key, params);
const russian = (key: string, params?: Readonly<Record<string, string | number>>) =>
  translate('ru', key, params);

describe('what the Chronicle’s pages show of a chapter', () => {
  it('takes the place most entries happen at, the first told on a tie', () => {
    expect(mainPlace(chapter)?.name).toBe('Market Square');
    const tie = { ...chapter, entries: chapter.entries.slice(0, 2) };
    expect(mainPlace(tie)?.name).toBe('North Gate');
    expect(mainPlace({ ...chapter, entries: [] })).toBeNull();
  });

  it('lists the people met once each, not the party that tells it', () => {
    expect(peopleMet(chapter).map((who) => who.name)).toEqual(['Captain Thorne', 'Mira Vale']);
  });

  it('lists every record once, with its epistemic type as supplied', () => {
    expect(learned(chapter).map((record) => record.knowledgeType)).toEqual(['TESTIMONY', 'RUMOR']);
  });

  it('gives a passage its cited entries in its order, skipping a key the chapter lacks', () => {
    expect(
      citedEntries(chapter, chapter.prose.paragraphs[0] ?? { text: '', cites: [] }).map(
        (cited) => cited.key,
      ),
    ).toEqual(['e3', 'e1']);
  });

  it('says what recorded a source and who a chapter is told from, never an ID', () => {
    expect(eventWords('MemoryRecorded')).toBe('a memory recorded');
    expect(eventWords('SomethingNew')).toBe('something new');
    const names = new Map([['elowen-starwhisper', 'Elowen']]);
    expect(toldFrom(english, 'CHARACTER:elowen-starwhisper', names)).toBe('Elowen');
    expect(toldFrom(english, 'PARTY', names)).toBe('the party');
    expect(toldFrom(english, 'NPC:hidden-one', names)).toBe('another perspective');
    expect(toldFrom(russian, 'DM', names)).toBe('мастер');
  });

  it('says honestly whether the narrator or the plain record told the prose', () => {
    expect(proseTeller('template')).toBe('Told as the plain record');
    expect(proseTeller('anthropic')).toBe('Told by the narrator');
  });
});
