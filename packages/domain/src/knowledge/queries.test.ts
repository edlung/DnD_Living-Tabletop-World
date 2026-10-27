import { parsePerspective } from '@ltw/contracts';
import { beforeAll, describe, expect, it } from 'vitest';

import type { WorldState } from '../kernel/state.ts';
import { worldTimeAt } from '../kernel/world-time.ts';
import type { ResolvedPerspective } from './perspective.ts';
import {
  entityKnowledge,
  getKnowledge,
  knownEntities,
  listKnowledge,
  relatedKnowledge,
} from './queries.ts';
import {
  ALL_KNOWLEDGE_IDS,
  ASHEN_CIRCLE_ID,
  DM,
  EXPECTED_VISIBLE,
  FORBIDDEN_MARKERS,
  PLAYER,
  perspective,
  seedRavenford,
} from './testing/ravenford.ts';

let state: WorldState;

beforeAll(async () => {
  ({ state } = await seedRavenford());
});

const as = (raw: string): ResolvedPerspective => {
  const request = parsePerspective(raw);
  if (!request) throw new Error(raw);
  return perspective(state, raw === 'PARTY' || raw === 'PUBLIC' ? PLAYER : DM, request);
};
const ids = (views: readonly { knowledgeId: string }[]) => views.map((view) => view.knowledgeId);

/** Everything a perspective can obtain through every query, serialized. */
function everyOutput(p: ResolvedPerspective): string {
  const entityIds = [...state.entities.keys(), 'nobody', ASHEN_CIRCLE_ID];
  const knowledgeIds = [...ALL_KNOWLEDGE_IDS, 'nothing'];
  return JSON.stringify({
    list: listKnowledge(state, p),
    asOf: listKnowledge(state, p, { asOf: worldTimeAt(1, 9) }),
    get: knowledgeIds.map((id) => getKnowledge(state, p, id)),
    related: knowledgeIds.map((id) => relatedKnowledge(state, p, id, 3)),
    bySubject: entityIds.map((id) => listKnowledge(state, p, { subjectId: id })),
    about: entityIds.map((id) => entityKnowledge(state, p, id)),
    entities: knownEntities(state, p),
  });
}

describe.each(Object.keys(EXPECTED_VISIBLE))('perspective %s', (label) => {
  it('sees exactly its permitted records', () => {
    const result = listKnowledge(state, as(label));
    expect(result.ok && ids(result.knowledge).sort()).toEqual(
      [...(EXPECTED_VISIBLE[label] ?? [])].sort(),
    );
  });

  it('cannot obtain any forbidden secret through any query', () => {
    const output = everyOutput(as(label));
    const leaked = (FORBIDDEN_MARKERS[label] ?? []).filter((marker) => output.includes(marker));
    expect(leaked).toEqual([]);
  });

  it('never exposes canonical entity descriptions', () => {
    const output = everyOutput(as(label));
    const descriptions = [...state.entities.values()]
      .map((entity) => entity.description)
      .filter((description) => description.length > 0);
    expect(descriptions.filter((description) => output.includes(description))).toEqual([]);
  });

  it('gets the same answer for hidden and nonexistent records and entities', () => {
    const p = as(label);
    const visible = new Set(EXPECTED_VISIBLE[label]);
    for (const id of ALL_KNOWLEDGE_IDS.filter((candidate) => !visible.has(candidate))) {
      expect(getKnowledge(state, p, id)).toBeNull();
      expect(relatedKnowledge(state, p, id, 3)).toBeNull();
    }
    expect(entityKnowledge(state, p, ASHEN_CIRCLE_ID)).toBeNull();
    expect(entityKnowledge(state, p, 'item-0869f47a')).toBeNull();
    expect(entityKnowledge(state, p, 'nobody')).toBeNull();
  });

  it('exposes only whitelisted fields', () => {
    const result = listKnowledge(state, as(label));
    for (const view of result.ok ? result.knowledge : []) {
      expect(Object.keys(view).sort()).toEqual(
        [
          'attributedTo',
          'knowledgeId',
          'knowledgeType',
          'knownSince',
          'relations',
          'scope',
          'statement',
          'subjects',
        ].sort(),
      );
      for (const ref of [...view.subjects, ...(view.attributedTo ? [view.attributedTo] : [])]) {
        expect(Object.keys(ref).sort()).toEqual(['entityId', 'kind', 'name']);
      }
    }
  });
});

describe('relations across the boundary', () => {
  it('drops relations to records the perspective cannot see', () => {
    expect(getKnowledge(state, as('PARTY'), 'party-mira-departure')?.relations).toEqual([]);
    expect(getKnowledge(state, as('DM'), 'party-mira-departure')?.relations).toEqual([
      { type: 'DERIVED_FROM', knowledgeId: 'mira-departure' },
    ]);
  });

  it('never reveals that hidden truth contradicts a party hypothesis', () => {
    const related = relatedKnowledge(state, as('PARTY'), 'party-goblin-hypothesis', 3);
    expect(related && ids(related.nodes)).toEqual([
      'party-goblin-hypothesis',
      'party-who-attacked',
    ]);
    expect(related?.edges).toEqual([
      { from: 'party-who-attacked', type: 'REFERS_TO', to: 'party-goblin-hypothesis' },
    ]);

    const dmView = relatedKnowledge(state, as('DM'), 'party-goblin-hypothesis', 1);
    expect(dmView && ids(dmView.nodes).sort()).toEqual(
      [
        'dm-goblin-theory-note',
        'party-goblin-hypothesis',
        'party-who-attacked',
        'truth-not-goblins',
      ].sort(),
    );
  });

  it('keeps the hypothesis a hypothesis for the party', () => {
    expect(getKnowledge(state, as('PARTY'), 'party-goblin-hypothesis')?.knowledgeType).toBe(
      'HYPOTHESIS',
    );
  });
});

describe('entities through knowledge', () => {
  const entityIds = (p: ResolvedPerspective) => knownEntities(state, p).map((ref) => ref.entityId);

  it('knows only entities named by visible records, itself, and party members', () => {
    expect(entityIds(as('PARTY'))).toEqual(
      [
        'captain-thorne',
        'elowen-starwhisper',
        'golden-stag-inn',
        'guild-caravan',
        'market-square',
        'merchant-guild',
        'merchant-guild-faction',
        'mira-vale',
        'north-gate',
        'old-trade-road',
        'orin-stonebeard',
        'orins-alchemy',
        'ravenford',
        'ravenford-guard',
      ].sort(),
    );
    expect(entityIds(as('NPC:mira-vale'))).not.toContain('elowen-starwhisper');
    expect(entityIds(as('NPC:orin-stonebeard'))).toContain('feature-19c7c7f7');
    expect(entityIds(as('DM'))).toContain(ASHEN_CIRCLE_ID);
  });

  it('answers what a perspective knows about an entity and its related entities', () => {
    const about = entityKnowledge(state, as('NPC:orin-stonebeard'), 'feature-19c7c7f7');
    expect(about && ids(about.knowledge)).toEqual(['orin-symbol-secret', 'orin-prior-incident']);
    expect(about?.relatedEntities.map((ref) => ref.entityId)).toEqual(['old-trade-road']);

    const caravan = entityKnowledge(state, as('PARTY'), 'guild-caravan');
    expect(caravan?.relatedEntities.map((ref) => ref.entityId)).toEqual([
      'merchant-guild-faction',
      'mira-vale',
    ]);
    expect(caravan?.entity).toEqual({
      entityId: 'guild-caravan',
      kind: 'item',
      name: 'Merchant Guild caravan',
    });
  });
});

describe('queries over time and filters', () => {
  it('reports what a perspective knew at an earlier world time', () => {
    const before = listKnowledge(state, as('PARTY'), { asOf: worldTimeAt(1, 9) });
    expect(before.ok && ids(before.knowledge)).not.toContain('party-goblin-hypothesis');
    const after = listKnowledge(state, as('PARTY'), { asOf: worldTimeAt(1, 9, 45) });
    expect(after.ok && ids(after.knowledge)).toContain('party-who-attacked');
    expect(listKnowledge(state, as('PARTY'), { asOf: state.clock + 1 })).toEqual({
      ok: false,
      reason: 'INVALID_AS_OF',
    });
  });

  it('filters by type and subject without widening visibility', () => {
    const hypotheses = listKnowledge(state, as('PARTY'), { knowledgeType: 'HYPOTHESIS' });
    expect(hypotheses.ok && ids(hypotheses.knowledge)).toEqual(['party-goblin-hypothesis']);
    const secrets = listKnowledge(state, as('PARTY'), { knowledgeType: 'SECRET' });
    expect(secrets.ok && secrets.knowledge).toEqual([]);
    const ashen = listKnowledge(state, as('PARTY'), { subjectId: ASHEN_CIRCLE_ID });
    expect(ashen.ok && ashen.knowledge).toEqual([]);
  });
});

describe('DM view', () => {
  it('sees every record with provenance', () => {
    const all = listKnowledge(state, as('DM'));
    expect(all.ok && ids(all.knowledge).sort()).toEqual([...ALL_KNOWLEDGE_IDS].sort());
    expect(getKnowledge(state, as('DM'), 'truth-ashen-circle')?.origin).toMatchObject({
      actorId: 'dm-ravenford',
      commandId: expect.stringMatching(/^ravenford\.knowledge\./) as unknown,
    });
  });
});
