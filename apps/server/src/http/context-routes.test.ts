import type { ApiErrorResponse, EntityContextResponse } from '@ltw/contracts';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  ASHEN_CIRCLE_ID,
  FORBIDDEN_MARKERS,
  TOKENS,
  get,
  ravenfordApp,
  withoutRequestId,
} from '../testing/ravenford-app.ts';

/** Stage 50 entity context over HTTP (ADR 0012, ADR 0009 check order). */
let app: FastifyInstance;
const BASE = '/campaigns/ravenford';
const ELOWEN_MARKERS = FORBIDDEN_MARKERS['CHARACTER:elowen-starwhisper'] ?? [];
const ENTITY_IDS = [
  'mira-vale',
  'orin-stonebeard',
  'captain-thorne',
  'elowen-starwhisper',
  'guild-caravan',
  'market-square',
  'ravenford',
  'old-trade-road',
  'merchant-guild-faction',
  'strange-symbol',
  'abandoned-caravan-site',
  'goblin-weapon',
  ASHEN_CIRCLE_ID,
  'no-such-entity',
];
const contextUrl = (entityId: string, perspective: string) =>
  `${BASE}/entities/${entityId}/context?perspective=${perspective}`;

beforeAll(async () => {
  app = await ravenfordApp();
});

afterAll(async () => {
  await app.close();
});

describe('GET /campaigns/:id/entities/:entityId/context', () => {
  it('returns Mira’s context for Elowen’s player', async () => {
    const response = await get(app, contextUrl('mira-vale', 'PLAYER'), TOKENS.player);
    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    const body = response.json<EntityContextResponse>();
    expect(body).toMatchObject({
      perspective: 'CHARACTER:elowen-starwhisper',
      actingCharacterId: 'elowen-starwhisper',
      context: {
        entity: { entityId: 'mira-vale', kind: 'npc', name: 'Mira Vale' },
        visibleState: { present: true, status: 'active' },
      },
    });
    const ids = body.context.actions.map((action) => action.topic?.entityId ?? action.id);
    expect(ids).toEqual(expect.arrayContaining(['talk', 'trade', 'ravenford', 'inspect']));
  });

  it('lets the DM preview the character’s context, identical to the player’s', async () => {
    const asPlayer = await get(app, contextUrl('mira-vale', 'PLAYER'), TOKENS.player);
    const asDm = await get(app, contextUrl('mira-vale', 'CHARACTER:elowen-starwhisper'), TOKENS.dm);
    expect(asDm.statusCode).toBe(200);
    expect(asDm.json()).toEqual(asPlayer.json());
  });

  it('never returns forbidden text for any entity, known or not', async () => {
    for (const entityId of ENTITY_IDS) {
      const response = await get(app, contextUrl(entityId, 'PLAYER'), TOKENS.player);
      const body = response.json<EntityContextResponse | ApiErrorResponse>();
      const text = JSON.stringify('context' in body ? body.context : withoutRequestId(response));
      expect(
        ELOWEN_MARKERS.filter((marker) => text.includes(marker)),
        entityId,
      ).toEqual([]);
    }
  });

  it('answers unknown, unperceived and nonexistent entities with one uniform 404', async () => {
    const bodies = await Promise.all(
      ['strange-symbol', ASHEN_CIRCLE_ID, 'no-such-entity'].map(async (entityId) => {
        const response = await get(app, contextUrl(entityId, 'PLAYER'), TOKENS.player);
        expect(response.statusCode, entityId).toBe(404);
        return withoutRequestId(response);
      }),
    );
    expect(new Set(bodies.map((body) => JSON.stringify(body))).size).toBe(1);
  });

  it.each([
    ['PARTY', TOKENS.player],
    ['PUBLIC', TOKENS.player],
    ['DM', TOKENS.dm],
    ['NPC:mira-vale', TOKENS.dm],
  ])('refuses %s (no acting character) with 403 before looking up the entity', async (p, token) => {
    for (const entityId of ['mira-vale', 'no-such-entity']) {
      const response = await get(app, contextUrl(entityId, p), token);
      expect(response.statusCode, entityId).toBe(403);
    }
  });

  it('follows the ADR 0009 check order', async () => {
    expect((await get(app, contextUrl('mira-vale', 'PLAYER'))).statusCode).toBe(401);
    expect((await get(app, contextUrl('Bad Id!', 'PLAYER'), TOKENS.player)).statusCode).toBe(400);
    expect(
      (await get(app, `${contextUrl('mira-vale', 'PLAYER')}&extra=1`, TOKENS.player)).statusCode,
    ).toBe(400);
    expect((await get(app, contextUrl('mira-vale', 'PLAYER'), TOKENS.outsider)).statusCode).toBe(
      404,
    );
    expect(
      (await get(app, contextUrl('mira-vale', 'CHARACTER:mira-vale'), TOKENS.player)).statusCode,
    ).toBe(403);
    expect(
      (
        await get(
          app,
          `/campaigns/elsewhere/entities/mira-vale/context?perspective=PLAYER`,
          TOKENS.player,
        )
      ).statusCode,
    ).toBe(404);
  });
});
