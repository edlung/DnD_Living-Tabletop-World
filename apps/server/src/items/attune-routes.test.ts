import { randomUUID } from 'node:crypto';

import type { AttunedResponse } from '@ltw/contracts';
import type { WorldEngine } from '@ltw/domain';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { InMemoryRestStore, InMemoryTableStore } from '../dice/table-store.ts';
import {
  TOKENS,
  post,
  ravenfordApp,
  seededEngine,
  testAiGateway,
  testAssets,
  testAuthoring,
  testDm,
} from '../testing/ravenford-app.ts';

/**
 * Attunement at the table (docs/adr/0054-items-as-data.md §5): Elowen's player attunes her to a
 * Ring of Protection only in a Short Rest the DM opened; the DM attunes any time, and only the DM
 * lifts a curse.
 */
let app: FastifyInstance;
let engine: WorldEngine;
const BASE = '/campaigns/ravenford';
const ELOWEN = 'elowen-starwhisper';
const DM = { actorId: 'dm-ravenford', kind: 'user' } as const;

const call = (path: string, body: object, token: string, perspective: string) =>
  post(app, `${BASE}/${path}?perspective=${perspective}`, body, token);
const dmCommand = (command: object) =>
  engine.execute({ campaignId: 'ravenford', commandId: randomUUID(), actor: DM, command });
const attune = (itemId: string, body: object, token: string, perspective: string) =>
  call(
    `items/${itemId}/attune`,
    { requestId: randomUUID(), characterId: ELOWEN, ...body },
    token,
    perspective,
  );

async function give(itemId: string, catalogId: string, baseCatalogId?: string) {
  await dmCommand({
    type: 'CreateEntity',
    entityId: itemId,
    kind: 'item',
    name: itemId,
    existsSince: null,
  });
  await dmCommand({
    type: 'GrantItem',
    itemId,
    holderId: ELOWEN,
    catalogId,
    ...(baseCatalogId ? { baseCatalogId } : {}),
  });
}

beforeAll(async () => {
  engine = await seededEngine();
  app = await ravenfordApp(
    engine,
    testAiGateway(),
    testAuthoring(),
    testAssets().contents,
    testDm(),
    {
      store: new InMemoryTableStore(),
      rests: new InMemoryRestStore(),
      dice: { roll: () => 1 },
      now: () => new Date().toISOString(),
    },
  );
  await give('item-ring', 'srd-ring-of-protection');
  await give('item-axe', 'srd-berserker-axe', 'srd-greataxe');
});
afterAll(async () => {
  await app.close();
});

describe('attunement at the table', () => {
  it('a player attunes only in a Short Rest; the DM any time', async () => {
    const outside = await attune('item-ring', { attuned: true }, TOKENS.player, 'PLAYER');
    expect(outside.statusCode).toBe(409);
    const opened = await call('rest', { requestId: randomUUID(), kind: 'short' }, TOKENS.dm, 'DM');
    expect(opened.statusCode).toBe(201);
    const attuned = await attune('item-ring', { attuned: true }, TOKENS.player, 'PLAYER');
    expect(attuned.statusCode).toBe(200);
    expect(attuned.json<AttunedResponse>()).toEqual({ status: 'attuned' });
    const state = (await engine.load('ravenford'))?.state;
    expect(state?.possessions.get('item-ring')?.attuned).toBe(true);
    // The table's system actor recorded it, as a spent Hit Point Die.
    expect(state?.commands.size).toBeGreaterThan(0);
    await call('rest/end', { requestId: randomUUID() }, TOKENS.dm, 'DM');
    // The DM ends it with no rest.
    expect((await attune('item-ring', { attuned: false }, TOKENS.dm, 'DM')).statusCode).toBe(200);
  });

  it('only the DM lifts a curse', async () => {
    expect((await attune('item-axe', { attuned: true }, TOKENS.dm, 'DM')).statusCode).toBe(200);
    const held = await attune('item-axe', { attuned: false }, TOKENS.dm, 'DM');
    expect(held.statusCode).toBe(422);
    expect(held.json()).toMatchObject({ details: { attunement: 'curse' } });
    expect(
      (await attune('item-axe', { attuned: false, liftCurse: true }, TOKENS.player, 'PLAYER'))
        .statusCode,
    ).toBe(403);
    expect(
      (await attune('item-axe', { attuned: false, liftCurse: true }, TOKENS.dm, 'DM')).statusCode,
    ).toBe(200);
    const sheet = (await engine.load('ravenford'))?.state.characterSheets.get(ELOWEN);
    expect(sheet?.saveBonus).toBeUndefined();
  });
});
