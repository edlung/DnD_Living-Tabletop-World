import { MEMORY_KINDS, parsePerspective } from '@ltw/contracts';
import { beforeAll, describe, expect, it } from 'vitest';

import boundary from '../../../../fixtures/ravenford/memory-boundary.json' with { type: 'json' };
import memorySeed from '../../../../fixtures/ravenford/memory-seed.json' with { type: 'json' };
import type { WorldState } from '../kernel/state.ts';
import { worldTimeAt } from '../kernel/world-time.ts';
import type { ResolvedPerspective } from '../knowledge/perspective.ts';
import { knownEntities } from '../knowledge/queries.ts';
import { DM, PLAYER, perspective, seedRavenford } from '../knowledge/testing/ravenford.ts';
import { getMemory, listSessions, recallMemories, type RecallQuery } from './retrieval.ts';

let state: WorldState;
const VISIBLE: Record<string, readonly string[]> = boundary.visible;
const FORBIDDEN: Record<string, readonly string[]> = boundary.forbiddenMarkers;
const MEMORY_IDS = memorySeed.commands.flatMap((c) =>
  'memoryId' in c && typeof c.memoryId === 'string' ? [c.memoryId] : [],
);

beforeAll(async () => {
  ({ state } = await seedRavenford());
});

const as = (raw: string): ResolvedPerspective => {
  const request = parsePerspective(raw);
  if (!request) throw new Error(raw);
  const player = raw === 'PARTY' || raw === 'PUBLIC' || raw === 'PLAYER';
  return perspective(state, player ? PLAYER : DM, request);
};
const recallIds = (p: ResolvedPerspective, query: RecallQuery = {}) => {
  const result = recallMemories(state, p, { limit: 50, ...query });
  return result.ok ? result.memories.map((m) => m.memory.memoryId) : [];
};

/** Words from every memory summary: probing with hidden words must reveal nothing. */
const PROBE_WORDS = [
  'traveller crate symbol',
  'patrol returned',
  'roll dawn',
  'glancing nervously',
  'supplies road',
  'symbol',
  'caravan',
  'zzzz nothing',
];

function everyRecall(p: ResolvedPerspective): string {
  const entities = [...state.entities.keys(), 'no-such-entity'];
  const queries: RecallQuery[] = [
    {},
    ...PROBE_WORDS.map((text) => ({ text })),
    ...entities.map((entityId) => ({ entityId })),
    ...entities.map((locationId) => ({ locationId })),
    ...MEMORY_KINDS.map((memoryKind) => ({ memoryKind })),
    { sessionId: 'ravenford-s1' },
    { from: worldTimeAt(-300), to: worldTimeAt(0) },
    { asOf: worldTimeAt(-1, 6) },
    { asOf: worldTimeAt(1, 9, 40) },
  ];
  return JSON.stringify({
    recalls: queries.map((query) => recallMemories(state, p, { limit: 50, ...query })),
    gets: [...MEMORY_IDS, 'no-such-memory'].map((id) => getMemory(state, p, id)),
  });
}

describe.each(Object.keys(VISIBLE))('memory perspective %s', (label) => {
  it('recalls exactly its permitted memories', () => {
    expect(recallIds(as(label)).sort()).toEqual([...(VISIBLE[label] ?? [])].sort());
  });

  it('never returns forbidden text through any query, filter, or ID', () => {
    const output = everyRecall(as(label));
    expect((FORBIDDEN[label] ?? []).filter((marker) => output.includes(marker))).toEqual([]);
  });

  it('answers hidden and nonexistent memories identically', () => {
    const visible = new Set(VISIBLE[label]);
    for (const id of MEMORY_IDS.filter((candidate) => !visible.has(candidate))) {
      expect(getMemory(state, as(label), id)).toBeNull();
    }
  });
});

describe('scope comes before matching, scoring, and counting', () => {
  it('treats words found only in hidden memories like nonsense', () => {
    const party = as('PARTY');
    const hiddenWords = recallMemories(state, party, { text: 'traveller crate' });
    const nonsense = recallMemories(state, party, { text: 'zzzz qqqq' });
    expect(hiddenWords).toEqual({ ok: true, total: 0, memories: [] });
    expect(hiddenWords).toEqual(nonsense);
  });

  it('gives the same scores and order whether or not hidden memories exist', () => {
    const party = as('PARTY');
    const withHidden = recallMemories(state, party, { text: 'caravan' });
    const onlyVisible = recallMemories(
      {
        ...state,
        memories: new Map([...state.memories].filter(([id]) => VISIBLE['PARTY']?.includes(id))),
      },
      party,
      { text: 'caravan' },
    );
    expect(withHidden).toEqual(onlyVisible);
  });
});

describe('retrieval behavior (ADVERSARIAL_TESTS.md J)', () => {
  it('J1: "where did we see this symbol" finds no unrelated private symbol memory for the party', () => {
    expect(recallIds(as('PARTY'), { text: 'where did we see this symbol' })).toEqual([]);
    expect(recallIds(as('NPC:orin-stonebeard'), { text: 'where did we see this symbol' })).toEqual([
      'mem-orin-prior-symbol',
    ]);
  });

  it('J2/J3: Elowen recalls her own and party memories, not events she did not witness', () => {
    const elowen = recallIds(as('PLAYER'), { entityId: 'mira-vale' });
    expect(elowen.sort()).toEqual(['mem-elowen-mira-glance', 'mem-party-talk-mira']);
    expect(recallIds(as('PARTY'), { entityId: 'mira-vale' })).toEqual(['mem-party-talk-mira']);
  });

  it('J4: entity and time filters override misleading wording', () => {
    const misleading = recallIds(as('NPC:captain-thorne'), { text: 'caravan dawn sunrise' });
    expect(misleading).toEqual(['mem-thorne-departure', 'mem-public-vanished-spring']);
    const byEntity = recallIds(as('NPC:captain-thorne'), {
      text: 'caravan',
      entityId: 'guild-caravan',
    });
    expect(byEntity).toEqual(['mem-thorne-departure']);
    const window = recallIds(as('NPC:captain-thorne'), {
      from: worldTimeAt(0),
      to: worldTimeAt(1),
    });
    expect(window).toEqual(['mem-thorne-patrol']);
  });

  it('recalls only what had happened as of a world time, and refuses the future', () => {
    expect(recallIds(as('PARTY'), { asOf: worldTimeAt(1, 9, 40) }).sort()).toEqual(
      ['mem-party-talk-mira', 'mem-public-vanished-spring'].sort(),
    );
    expect(recallMemories(state, as('PARTY'), { asOf: state.clock + 1 })).toEqual({
      ok: false,
      reason: 'INVALID_AS_OF',
    });
    expect(recallMemories(state, as('PARTY'), { from: 10, to: 5 })).toEqual({
      ok: false,
      reason: 'INVALID_WINDOW',
    });
  });

  it('ranks deterministically and explains the score', () => {
    const first = recallMemories(state, as('PARTY'), { text: 'caravan road' });
    const second = recallMemories(state, as('PARTY'), { text: 'caravan road' });
    expect(first).toEqual(second);
    const scores = first.ok ? first.memories.map((m) => m.score) : [];
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
    expect(scores.every((score) => score > 0 && score <= 1)).toBe(true);
  });

  it('limits results without changing the total', () => {
    const result = recallMemories(state, as('PLAYER'), { limit: 2 });
    expect(result.ok && result.memories).toHaveLength(2);
    expect(result.ok && result.total).toBe(VISIBLE['CHARACTER:elowen-starwhisper']?.length);
  });
});

describe('memory views', () => {
  it('cites only knowledge and causes the perspective can see', () => {
    const supplies = getMemory(state, as('PARTY'), 'mem-party-supplies');
    expect(supplies?.causedBy).toEqual(['mem-party-decide-road']);
    const talk = getMemory(state, as('PARTY'), 'mem-party-talk-mira');
    expect(talk?.relatedKnowledge).toEqual(['party-mira-departure']);
    expect(Object.keys(talk ?? {}).sort()).toEqual(
      [
        'causedBy',
        'location',
        'memoryId',
        'memoryKind',
        'occurredAt',
        'participants',
        'relatedKnowledge',
        'salience',
        'scope',
        'sessionId',
        'summary',
      ].sort(),
    );
  });

  it('filters hidden citations even if canonical data ever contained them (defense in depth)', () => {
    const publicMemory = state.memories.get('mem-public-vanished-spring');
    if (!publicMemory) throw new Error('fixture changed');
    const tampered: WorldState = {
      ...state,
      memories: new Map(state.memories).set(publicMemory.memoryId, {
        ...publicMemory,
        causedBy: ['mem-orin-prior-symbol'],
        relatedKnowledge: ['truth-ashen-circle'],
      }),
    };
    const view = getMemory(tampered, as('PARTY'), 'mem-public-vanished-spring');
    expect(view?.causedBy).toEqual([]);
    expect(view?.relatedKnowledge).toEqual([]);
  });

  it('makes entities named by visible memories known, and no others', () => {
    const orin = knownEntities(state, as('NPC:orin-stonebeard')).map((ref) => ref.entityId);
    expect(orin).toContain('feature-19c7c7f7');
    const party = knownEntities(state, as('PARTY')).map((ref) => ref.entityId);
    expect(party).not.toContain('feature-19c7c7f7');
  });

  it('lists sessions as out-of-world metadata', () => {
    expect(listSessions(state)).toEqual([
      {
        sessionId: 'ravenford-s1',
        title: 'Session 1: Arrival in Ravenford',
        startedAt: worldTimeAt(1, 10),
        endedAt: null,
      },
    ]);
  });
});
