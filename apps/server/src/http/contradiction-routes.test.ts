import type {
  CommandResult,
  KnowledgeListResponse,
  RelatedKnowledgeResponse,
} from '@ltw/contracts';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { TOKENS, get, ravenfordApp } from '../testing/ravenford-app.ts';

/**
 * Stage 70 over HTTP (docs/adr/0014-contradictions-and-epistemic-integrity.md):
 * the party surfaces Mira's and Thorne's conflicting accounts; nobody else
 * learns anything; player results reveal no DM structure.
 */
let app: FastifyInstance;
const BASE = '/campaigns/ravenford';
const ELOWEN = 'elowen-starwhisper';
let counter = 0;

beforeAll(async () => {
  app = await ravenfordApp();
});

afterAll(async () => {
  await app.close();
});

async function post(command: Record<string, unknown>, token: string = TOKENS.player, extra = {}) {
  counter += 1;
  const response = await app.inject({
    method: 'POST',
    url: `${BASE}/commands`,
    headers: { authorization: `Bearer ${token}` },
    payload: { commandId: `ctr-${String(counter)}`, command, ...extra },
  });
  return { status: response.statusCode, body: response.json<CommandResult>(), raw: response.body };
}

const contradictionsFor = async (perspective: string, token: string) =>
  (
    await get(app, `${BASE}/knowledge?perspective=${perspective}&type=CONTRADICTION`, token)
  ).json<KnowledgeListResponse>().knowledge;

const DM_STRUCTURE = [
  'ClaimSet',
  'ContradictionDetected',
  'departure-time',
  'before-dawn',
  'after-sunrise',
  '"claim"',
  '"sequence"',
];

describe('the departure contradiction over HTTP', () => {
  it('appears for the party when Thorne is asked, and the result reveals no DM structure', async () => {
    expect(await contradictionsFor('PARTY', TOKENS.player)).toEqual([]);
    await post({ type: 'EnterLocation', characterId: ELOWEN, locationId: 'north-gate' });
    const asked = await post({
      type: 'AskAbout',
      characterId: ELOWEN,
      npcId: 'captain-thorne',
      topicId: 'guild-caravan',
    });
    expect(asked.status).toBe(200);
    expect(asked.body).toMatchObject({
      status: 'accepted',
      events: [],
      outcome: { kind: 'AskAbout' },
    });
    for (const leak of DM_STRUCTURE) expect(asked.raw).not.toContain(leak);

    const [found, ...rest] = await contradictionsFor('PARTY', TOKENS.player);
    expect(rest).toEqual([]);
    expect(found?.statement).toMatch(/Mira Vale/);
    expect(found?.statement).toMatch(/Captain Thorne/);
    expect(found?.relations.map((r) => r.knowledgeId)).toContain('party-mira-departure');
    expect(await contradictionsFor('PLAYER', TOKENS.player)).toHaveLength(1);

    const related = (
      await get(
        app,
        `${BASE}/knowledge/${found?.knowledgeId ?? ''}/related?perspective=PARTY`,
        TOKENS.player,
      )
    ).json<RelatedKnowledgeResponse>();
    const statements = related.nodes.map((node) => node.statement).join(' ');
    expect(statements).toContain('before dawn');
    expect(statements).toContain('after sunrise');
    for (const leak of DM_STRUCTURE) expect(JSON.stringify(related)).not.toContain(leak);
  });

  it('stays out of every other scope', async () => {
    expect(await contradictionsFor('PUBLIC', TOKENS.player)).toEqual([]);
    for (const npc of ['mira-vale', 'captain-thorne', 'orin-stonebeard']) {
      expect(await contradictionsFor(`NPC:${npc}`, TOKENS.dm)).toEqual([]);
    }
  });

  it('shows the DM the claims and the full result', async () => {
    const dmView = (
      await get(app, `${BASE}/knowledge/party-mira-departure?perspective=DM`, TOKENS.dm)
    ).json<{ knowledge: { claim?: unknown } }>();
    expect(dmView.knowledge.claim).toEqual({
      subjectId: 'guild-caravan',
      aspect: 'departure-time',
      value: 'before-dawn',
    });
    const partyView = (
      await get(app, `${BASE}/knowledge/party-mira-departure?perspective=PARTY`, TOKENS.player)
    ).json<{ knowledge: Record<string, unknown> }>();
    expect('claim' in partyView.knowledge).toBe(false);

    await post(
      {
        type: 'AddKnowledge',
        knowledgeId: 'x-rumor',
        scope: { kind: 'PARTY' },
        knowledgeType: 'RUMOR',
        statement: 'Someone says it left at noon.',
        subjects: ['guild-caravan'],
        knownSince: null,
      },
      TOKENS.dm,
    );
    const claimed = await post(
      {
        type: 'SetClaim',
        target: { kind: 'knowledge', knowledgeId: 'x-rumor' },
        claim: { subjectId: 'guild-caravan', aspect: 'departure-time', value: 'at-noon' },
      },
      TOKENS.dm,
    );
    expect(claimed.body.status !== 'rejected' && claimed.body.events.map((e) => e.type)).toEqual([
      'ClaimSet',
      'KnowledgeAssigned',
      'ContradictionDetected',
      'KnowledgeAssigned',
      'ContradictionDetected',
    ]);
  });
});

describe('player results', () => {
  it('carry no details and no stream versions', async () => {
    const again = await post({
      type: 'AskAbout',
      characterId: ELOWEN,
      npcId: 'captain-thorne',
      topicId: 'guild-caravan',
    });
    expect(again.body).toEqual({
      status: 'rejected',
      commandId: expect.any(String) as unknown,
      code: 'NO_EFFECT',
      message: 'Nothing new to share',
    });
    const versioned = await post(
      { type: 'EnterLocation', characterId: ELOWEN, locationId: 'ravenford' },
      TOKENS.player,
      { expectedVersion: 1 },
    );
    expect(versioned.status).toBe(400);
    expect(versioned.raw).not.toMatch(/version/i);
  });

  it('keep schema issues about the player’s own input', async () => {
    const malformed = await post({ type: 'EnterLocation', characterId: ELOWEN });
    expect(malformed.status).toBe(400);
    expect(malformed.body).toMatchObject({ status: 'rejected', code: 'INVALID_COMMAND' });
    expect(malformed.body.status === 'rejected' && malformed.body.details).toBeDefined();
  });
});
