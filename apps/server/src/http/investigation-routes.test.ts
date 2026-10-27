import type { CommandResult, EntityContextResponse, KnowledgeListResponse } from '@ltw/contracts';
import { InMemoryEventStore } from '@ltw/domain';
import { scriptedDice } from '@ltw/rules';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { TOKENS, get, ravenfordApp, seededEngine } from '../testing/ravenford-app.ts';

/**
 * Stage 60 over HTTP: the player's investigation path end to end
 * (docs/adr/0013-investigation.md), with scripted dice.
 */
let app: FastifyInstance;
const BASE = '/campaigns/ravenford';
const ELOWEN = 'elowen-starwhisper';
let counter = 0;

beforeAll(async () => {
  app = await ravenfordApp(await seededEngine(new InMemoryEventStore(), scriptedDice([11, 20])));
});

afterAll(async () => {
  await app.close();
});

async function post(command: Record<string, unknown>, token: string = TOKENS.player) {
  counter += 1;
  const response = await app.inject({
    method: 'POST',
    url: `${BASE}/commands`,
    headers: { authorization: `Bearer ${token}` },
    payload: { commandId: `inv-${String(counter)}`, command },
  });
  return { status: response.statusCode, body: response.json<CommandResult>(), raw: response.body };
}
const as = (fields: Record<string, unknown>) => ({ characterId: ELOWEN, ...fields });
const contextOf = async (entityId: string) =>
  (
    await get(app, `${BASE}/entities/${entityId}/context?perspective=PLAYER`, TOKENS.player)
  ).json<EntityContextResponse>();

describe('investigation path over HTTP', () => {
  it('runs Mira → site → evidence → hypothesis and keeps hypotheses as hypotheses', async () => {
    const asked = await post(
      as({ type: 'AskAbout', npcId: 'mira-vale', topicId: 'guild-caravan' }),
    );
    expect(asked.status).toBe(200);
    expect(asked.body).toMatchObject({ status: 'accepted', outcome: { kind: 'AskAbout' } });
    expect(asked.raw).not.toContain('mira-cargo-logistics');

    for (const locationId of ['old-trade-road', 'location-f3b82c8b']) {
      expect((await post(as({ type: 'EnterLocation', locationId }))).status).toBe(200);
    }
    expect((await contextOf('feature-19c7c7f7')).context.entity.name).toBeNull();

    const inspected = await post(
      as({ type: 'ExamineEntity', entityId: 'feature-19c7c7f7', method: 'inspect' }),
    );
    expect(inspected.body).toMatchObject({ outcome: { kind: 'ExamineEntity', roll: null } });
    expect((await contextOf('feature-19c7c7f7')).context.entity.name).toBe('Strange Symbol');

    const checked = await post(
      as({ type: 'ExamineEntity', entityId: 'feature-19c7c7f7', method: 'investigation' }),
    );
    expect(checked.body).toMatchObject({
      outcome: { kind: 'ExamineEntity', roll: { d20: 11, modifier: 8, total: 19 } },
    });
    for (const secret of ['clue-', '"dc"', 'resolution', 'clueId']) {
      expect(checked.raw).not.toContain(secret);
    }
    const again = await post(
      as({ type: 'ExamineEntity', entityId: 'feature-19c7c7f7', method: 'investigation' }),
    );
    expect(again.body).toMatchObject({ status: 'rejected', code: 'ALREADY_ATTEMPTED' });

    const formed = await post(
      as({
        type: 'FormHypothesis',
        scope: 'PARTY',
        statement: 'Someone staged the attack.',
        relations: [{ type: 'CONTRADICTS', knowledgeId: 'party-goblin-hypothesis' }],
      }),
    );
    expect(formed.body).toMatchObject({ outcome: { kind: 'FormHypothesis' } });

    const party = (
      await get(app, `${BASE}/knowledge?perspective=PARTY`, TOKENS.player)
    ).json<KnowledgeListResponse>();
    const types = new Map(party.knowledge.map((k) => [k.knowledgeId, k.knowledgeType]));
    expect(types.get('party-goblin-hypothesis')).toBe('HYPOTHESIS');
    const newId =
      formed.body.status !== 'rejected' && formed.body.outcome?.kind === 'FormHypothesis'
        ? formed.body.outcome.knowledgeId
        : '';
    expect(types.get(newId)).toBe('HYPOTHESIS');
    const text = JSON.stringify(party);
    for (const marker of [
      'Ashen',
      'manipulated',
      'arranged',
      'not simply goblins',
      'mark of',
      'reagent',
    ]) {
      expect(text).not.toContain(marker);
    }
  });
});

describe('player command boundaries over HTTP', () => {
  it('keeps authoring DM-only and characters private, with a uniform 403', async () => {
    const bodies = await Promise.all([
      post({ type: 'AddClue', entityId: 'item-0869f47a', method: 'inspect', statement: 'x' }),
      post({ type: 'SetDisclosure', knowledgeId: 'orin-knows-thorne', disclosure: 'WILLING' }),
      post({ type: 'EnterLocation', characterId: 'mira-vale', locationId: 'ravenford' }),
      post({ type: 'EnterLocation', characterId: 'no-such-character', locationId: 'ravenford' }),
    ]);
    expect(bodies.map((b) => b.status)).toEqual([403, 403, 403, 403]);
    const outsider = await post(
      as({ type: 'EnterLocation', locationId: 'ravenford' }),
      TOKENS.outsider,
    );
    expect(outsider.status).toBe(404);
  });

  it('rejects unknown and nonexistent targets with one body and no details', async () => {
    const shapes = await Promise.all(
      ['orins-alchemy-cellar', 'no-such-entity', '3f9c2b7e-5a1d-4e8f-9b06-7c4d2e1a8f53'].map(
        async (entityId) => {
          const { status, body } = await post(
            as({ type: 'ExamineEntity', entityId, method: 'inspect' }),
          );
          return {
            status,
            code: body.status === 'rejected' ? body.code : null,
            message: body.status === 'rejected' ? body.message : null,
            details: body.status === 'rejected' ? body.details : null,
          };
        },
      ),
    );
    expect(shapes).toEqual(
      Array(3).fill({
        status: 422,
        code: 'ENTITY_NOT_FOUND',
        message: 'Not found',
        details: undefined,
      }),
    );
  });
});
