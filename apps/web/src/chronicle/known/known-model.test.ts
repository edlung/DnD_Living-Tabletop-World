import type {
  ChronicleChapterView,
  ChronicleEntryView,
  EntityRef,
  KnowledgeView,
  QuestView,
} from '@ltw/contracts';
import { describe, expect, it } from 'vitest';

import { assembleKnown, matching } from './known-model.ts';

/**
 * The party's encyclopedia (docs/adr/0073-table-ideas.md §4), assembled from the party's reads
 * and nothing else: a name comes from the party's directory only; a record keeps its type; a
 * chapter of any other perspective tells nothing here.
 */
const ref = (entityId: string, kind: EntityRef['kind'], name: string): EntityRef => ({
  entityId,
  kind,
  name,
});
const MIRA = ref('mira-vale', 'npc', 'Mira Vale');
const WOLF = ref('creature-1', 'creature', 'Ashen Wolf');
const SQUARE = ref('market-square', 'location', 'Market Square');
const GATE = ref('north-gate', 'location', 'North Gate');
const SEAL = ref('caravan-seal', 'item', 'Caravan seal');
const CIRCLE = ref('ashen-circle', 'faction', 'Ashen Circle');
const ELOWEN = ref('elowen-starwhisper', 'character', 'Elowen Starwhisper');

const record = (
  knowledgeId: string,
  statement: string,
  subjects: readonly EntityRef[],
  knowledgeType: KnowledgeView['knowledgeType'] = 'FACT',
): KnowledgeView => ({
  knowledgeId,
  knowledgeType,
  scope: { kind: 'PARTY' },
  statement,
  subjects,
  attributedTo: null,
  relations: [],
  knownSince: 0,
});

const entry = (
  key: string,
  location: EntityRef | null,
  participants: readonly EntityRef[],
): ChronicleEntryView => ({
  key,
  occurredAt: 0,
  text: key,
  salience: 1,
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
  title: string,
  perspective: string,
  entries: readonly ChronicleEntryView[],
): ChronicleChapterView => ({
  chronicleId,
  title,
  perspective,
  from: 0,
  to: 10,
  sessionId: null,
  generatedAt: 10,
  entries,
  prose: { provider: 'template', model: 'template', traceId: null, paragraphs: [] },
});

const read = {
  entities: [SQUARE, MIRA, ELOWEN, WOLF, SEAL, CIRCLE, GATE],
  knowledge: [
    record('k1', 'Mira keeps the Gilded Flask.', [MIRA]),
    record('k2', 'They say Mira owes the Circle.', [MIRA, CIRCLE], 'RUMOR'),
    record('k3', 'The market closes at dusk.', [SQUARE]),
    record('k4', 'The road north is watched.', []),
  ],
  chapters: [
    chapter('chronicle.1', 'Arrival', 'PARTY', [entry('a', SQUARE, [MIRA, ELOWEN])]),
    chapter('chronicle.2', 'The DM’s own', 'DM', [entry('b', GATE, [WOLF])]),
    chapter('chronicle.3', 'The road', 'PARTY', [entry('c', GATE, []), entry('d', GATE, [MIRA])]),
  ],
  quests: [
    {
      questId: 'q1',
      title: 'Find the caravan',
      status: 'active',
      transitions: [
        {
          type: 'QuestActivated',
          stage: 'activated',
          worldTime: 1,
          summary: 'Sworn.',
          sources: [],
        },
        {
          type: 'QuestUpdated',
          stage: 'seal',
          worldTime: 2,
          summary: 'A seal found.',
          sources: [],
        },
      ],
    },
  ] as readonly QuestView[],
};

describe('the party’s encyclopedia', () => {
  const known = assembleKnown(read);

  it('sorts what the party knows of into people, places and things, by name', () => {
    expect(known.people.map((one) => one.entity.name)).toEqual(['Ashen Wolf', 'Mira Vale']);
    expect(known.places.map((one) => one.entity.name)).toEqual(['Market Square', 'North Gate']);
    expect(known.things.map((one) => one.entity.name)).toEqual(['Ashen Circle', 'Caravan seal']);
    // The heroes are the book's cover, not an entry of what they met.
    expect(JSON.stringify(known)).not.toContain('Elowen');
    expect(known.empty).toBe(false);
  });

  it('gives each what the party knows of it, a rumour still a rumour', () => {
    const mira = known.people.find((one) => one.entity.entityId === MIRA.entityId);
    expect(mira?.facts).toEqual([
      { knowledgeId: 'k1', type: 'FACT', statement: 'Mira keeps the Gilded Flask.' },
      { knowledgeId: 'k2', type: 'RUMOR', statement: 'They say Mira owes the Circle.' },
    ]);
    // A record about two things is told under each.
    expect(known.things[0]?.facts.map((fact) => fact.knowledgeId)).toEqual(['k2']);
    expect(known.people[0]?.facts).toEqual([]);
    expect(known.lore).toEqual([
      { knowledgeId: 'k4', type: 'FACT', statement: 'The road north is watched.' },
    ]);
  });

  it('names the party’s chapters that tell of each, once, and no other perspective’s', () => {
    const mira = known.people.find((one) => one.entity.entityId === MIRA.entityId);
    expect(mira?.chapters).toEqual([
      { chronicleId: 'chronicle.1', title: 'Arrival' },
      { chronicleId: 'chronicle.3', title: 'The road' },
    ]);
    const gate = known.places.find((one) => one.entity.entityId === GATE.entityId);
    expect(gate?.chapters).toEqual([{ chronicleId: 'chronicle.3', title: 'The road' }]);
    // The wolf is only in the DM's own chapter: nothing of that chapter is told.
    expect(known.people[0]?.chapters).toEqual([]);
    expect(JSON.stringify(known)).not.toContain('The DM’s own');
  });

  it('takes no name from a chapter or a record that the directory does not list', () => {
    const stranger = ref('hidden-one', 'npc', 'The Hidden One');
    const leaky = assembleKnown({
      entities: [MIRA],
      knowledge: [record('k9', 'A whisper.', [stranger])],
      chapters: [chapter('chronicle.9', 'Leak', 'PARTY', [entry('z', null, [stranger])])],
      quests: [],
    });
    expect(leaky.people.map((one) => one.entity.name)).toEqual(['Mira Vale']);
    expect(JSON.stringify(leaky)).not.toContain('Hidden');
  });

  it('leaves a secret out, should one ever be handed in', () => {
    const withSecret = assembleKnown({
      ...read,
      knowledge: [...read.knowledge, record('k-secret', 'Mira is the thief.', [MIRA], 'SECRET')],
    });
    expect(JSON.stringify(withSecret)).not.toContain('thief');
  });

  it('says of each quest how it stands and what happened last', () => {
    expect(known.quests).toEqual([
      { questId: 'q1', title: 'Find the caravan', done: false, latest: 'A seal found.' },
    ]);
  });

  it('is empty when the party knows of nothing', () => {
    const none = assembleKnown({ entities: [ELOWEN], knowledge: [], chapters: [], quests: [] });
    expect(none.empty).toBe(true);
  });
});

describe('finding a name', () => {
  const known = assembleKnown(read);
  it('matches any part of it, whatever the case; nothing typed is everything', () => {
    expect(matching(known.people, '  mIRa ').map((one) => one.entity.name)).toEqual(['Mira Vale']);
    expect(matching(known.places, 'gate').map((one) => one.entity.name)).toEqual(['North Gate']);
    expect(matching(known.people, '')).toHaveLength(2);
    expect(matching(known.people, 'nobody')).toEqual([]);
  });
});
