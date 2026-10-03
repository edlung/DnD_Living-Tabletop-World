import { describe, expect, it } from 'vitest';

import { DM, ELOWEN, codeOf, investigationWorld } from './testing/world.ts';

/** EnterLocation and FormHypothesis (ADR 0013 §1, §4). */
const enter = (locationId: string) => ({ type: 'EnterLocation', characterId: ELOWEN, locationId });
const hypothesis = (fields: Record<string, unknown>) => ({
  type: 'FormHypothesis',
  characterId: ELOWEN,
  scope: 'PARTY',
  statement: 'Someone made it look like goblins.',
  ...fields,
});

describe('EnterLocation', () => {
  it('moves to a known location and then to a perceived child location', async () => {
    const world = await investigationWorld();
    const road = await world.submit(enter('old-trade-road'));
    expect(road.status !== 'rejected' && road.outcome).toEqual({
      kind: 'EnterLocation',
      locationId: 'old-trade-road',
    });
    expect(codeOf(await world.submit(enter('abandoned-caravan-site')))).toBe('accepted');
    const state = await world.state();
    expect(state.entities.get(ELOWEN)?.placement).toEqual({
      locationId: 'abandoned-caravan-site',
      since: state.clock,
    });
  });

  it('treats unknown, unperceived and nonexistent locations identically', async () => {
    const world = await investigationWorld();
    const results = await Promise.all(
      ['abandoned-caravan-site', 'no-such-place'].map(async (id) => {
        const r = await world.submit(enter(id));
        return r.status === 'rejected' ? [r.code, r.message, r.details] : r.status;
      }),
    );
    expect(results).toEqual(Array(2).fill(['ENTITY_NOT_FOUND', 'Not found', undefined]));
  });

  it('rejects the current location, non-locations, and dead characters', async () => {
    const world = await investigationWorld();
    expect(codeOf(await world.submit(enter('market-square')))).toBe('NO_EFFECT');
    expect(codeOf(await world.submit(enter('mira-vale')))).toBe('NOT_A_LOCATION');
    await world.submit({ type: 'ChangeEntityStatus', entityId: ELOWEN, status: 'dead' }, DM);
    expect(codeOf(await world.submit(enter('ravenford')))).toBe('ACTOR_DEAD');
  });

  it('may enter a destroyed location, so absent status never leaks', async () => {
    const world = await investigationWorld();
    await world.submit(
      { type: 'ChangeEntityStatus', entityId: 'golden-stag-inn', status: 'destroyed' },
      DM,
    );
    expect(codeOf(await world.submit(enter('golden-stag-inn')))).toBe('accepted');
  });
});

describe('FormHypothesis', () => {
  it('creates a HYPOTHESIS citing visible records', async () => {
    const world = await investigationWorld();
    const result = await world.submit(
      hypothesis({
        subjects: ['guild-caravan'],
        relations: [{ type: 'CONTRADICTS', knowledgeId: 'party-goblin-hypothesis' }],
      }),
    );
    const id =
      result.status !== 'rejected' && result.outcome?.kind === 'FormHypothesis'
        ? result.outcome.knowledgeId
        : '';
    expect((await world.state()).knowledge.get(id)).toMatchObject({
      scope: { kind: 'PARTY' },
      knowledgeType: 'HYPOTHESIS',
      attributedTo: null,
      relations: [{ type: 'CONTRADICTS', knowledgeId: 'party-goblin-hypothesis' }],
    });
  });

  it('refuses invisible records and unknown entities exactly like nonexistent ones', async () => {
    const world = await investigationWorld();
    const shape = async (fields: Record<string, unknown>) => {
      const r = await world.submit(hypothesis(fields));
      return r.status === 'rejected' ? [r.code, r.message] : r.status;
    };
    const cite = (knowledgeId: string) => ({ relations: [{ type: 'SUPPORTS', knowledgeId }] });
    expect(await shape(cite('truth-goblin-frame'))).toEqual(['KNOWLEDGE_NOT_FOUND', 'Not found']);
    expect(await shape(cite('orin-symbol-secret'))).toEqual(['KNOWLEDGE_NOT_FOUND', 'Not found']);
    expect(await shape(cite('no-such-record'))).toEqual(['KNOWLEDGE_NOT_FOUND', 'Not found']);
    for (const subject of [
      'strange-symbol',
      '3f9c2b7e-5a1d-4e8f-9b06-7c4d2e1a8f53',
      'no-such-entity',
    ]) {
      expect(await shape({ subjects: [subject] })).toEqual(['ENTITY_NOT_FOUND', 'Not found']);
    }
  });

  it('keeps private hypotheses in the character scope', async () => {
    const world = await investigationWorld();
    const result = await world.submit(hypothesis({ scope: 'CHARACTER' }));
    const id =
      result.status !== 'rejected' && result.outcome?.kind === 'FormHypothesis'
        ? result.outcome.knowledgeId
        : '';
    expect((await world.state()).knowledge.get(id)?.scope).toEqual({
      kind: 'CHARACTER',
      characterId: ELOWEN,
    });
  });
});
