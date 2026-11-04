import { randomUUID } from 'node:crypto';

import type { AttunedResponse, IdentifiedResponse, InventoryResponse } from '@ltw/contracts';
import type { WorldEngine } from '@ltw/domain';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { InMemoryRestStore, InMemoryTableStore } from '../dice/table-store.ts';
import {
  TOKENS,
  get,
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

describe('identifying at the table', () => {
  const inventory = async (token: string, perspective: string) =>
    (
      await get(app, `${BASE}/entities/${ELOWEN}/inventory?perspective=${perspective}`, token)
    ).json<InventoryResponse>();
  const identify = (itemId: string, token: string, perspective: string) =>
    call(
      `items/${itemId}/identify`,
      { requestId: randomUUID(), characterId: ELOWEN },
      token,
      perspective,
    );

  it('the carrier sees only what an unidentified item looks like; the DM, all of it', async () => {
    await dmCommand({
      type: 'CreateEntity',
      entityId: 'item-veiled',
      kind: 'item',
      name: 'A plain ring',
      existsSince: null,
    });
    await dmCommand({
      type: 'GrantItem',
      itemId: 'item-veiled',
      holderId: ELOWEN,
      catalogId: 'srd-ring-of-protection',
      unidentified: true,
    });
    const seen = (await inventory(TOKENS.player, 'PLAYER')).items.find(
      (one) => one.itemId === 'item-veiled',
    );
    expect(seen).toMatchObject({
      name: 'A plain ring',
      unidentified: true,
      charges: null,
      catalog: {
        itemId: 'unknown-magic-item',
        magic: null,
        text: null,
        valueCp: 0,
        slots: ['ring'],
      },
    });
    const told = (await inventory(TOKENS.dm, 'DM')).items.find(
      (one) => one.itemId === 'item-veiled',
    );
    expect(told?.catalog?.itemId).toBe('srd-ring-of-protection');
    expect(told?.catalog?.text).toMatch(/\+1 bonus to Armor Class/);
    // Studied out of a rest: refused; the DM reveals it any time.
    expect((await identify('item-veiled', TOKENS.player, 'PLAYER')).statusCode).toBe(409);
    const revealed = await identify('item-veiled', TOKENS.dm, 'DM');
    expect(revealed.json<IdentifiedResponse>()).toEqual({
      status: 'identified',
      name: 'Ring of Protection',
    });
    const known = (await inventory(TOKENS.player, 'PLAYER')).items.find(
      (one) => one.itemId === 'item-veiled',
    );
    expect(known?.catalog?.itemId).toBe('srd-ring-of-protection');
  });

  it('a potion is known by a taste, out of a rest too', async () => {
    await dmCommand({
      type: 'CreateEntity',
      entityId: 'item-vial',
      kind: 'item',
      name: 'A red vial',
      existsSince: null,
    });
    await dmCommand({
      type: 'GrantItem',
      itemId: 'item-vial',
      holderId: ELOWEN,
      catalogId: 'srd-potion-of-healing-greater',
      unidentified: true,
    });
    expect((await identify('item-vial', TOKENS.player, 'PLAYER')).statusCode).toBe(200);
  });
});
