import type { InventoryResponse } from '@ltw/contracts';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  TOKENS,
  get,
  post,
  ravenfordApp,
  seededEngine,
  withoutRequestId,
} from '../testing/ravenford-app.ts';

/** Stage 460 (docs/adr/0039-item-possession.md): the inventory is the carrier's own, or the DM's. */
let app: FastifyInstance;
const OWN = 'elowen-starwhisper';
const BASE = '/campaigns/ravenford/entities';
const url = (id = OWN, perspective = 'PLAYER') =>
  `${BASE}/${id}/inventory?perspective=${perspective}`;
const DM = { kind: 'user', actorId: 'dm-ravenford' } as const;

beforeAll(async () => {
  const engine = await seededEngine();
  const run = async (commandId: string, command: Record<string, unknown>) => {
    const result = await engine.execute({ campaignId: 'ravenford', commandId, actor: DM, command });
    expect(result.status, commandId).toBe('accepted');
  };
  await run('inv-create-cloak', {
    type: 'CreateEntity',
    entityId: 'inv-cloak',
    kind: 'item',
    name: 'Grey travelling cloak',
    existsSince: null,
  });
  await run('inv-create-balm', {
    type: 'CreateEntity',
    entityId: 'inv-balm',
    kind: 'item',
    name: 'Orin balm',
    existsSince: null,
  });
  await run('inv-grant-cloak', {
    type: 'GrantItem',
    itemId: 'inv-cloak',
    holderId: OWN,
    catalogId: 'caravan-cloak',
  });
  await run('inv-grant-balm', {
    type: 'GrantItem',
    itemId: 'inv-balm',
    holderId: 'mira-vale',
    catalogId: 'woodland-balm',
    quantity: 3,
  });
  app = await ravenfordApp(engine);
});
afterAll(async () => {
  await app.close();
});

describe('inventory view', () => {
  it("shows a player their own character's items with catalog data", async () => {
    const response = await get(app, url(), TOKENS.player);
    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    const body = response.json<InventoryResponse>();
    expect(body.items.map((item) => item.itemId)).toContain('inv-cloak');
    // Her seeded starting gear is carried too (Stage 470), and is the same for every viewer.
    expect(body.items.length).toBeGreaterThan(1);
    const cloak = body.items.find((item) => item.itemId === 'inv-cloak');
    expect(cloak?.catalog?.name.en).toBe('Caravan cloak');
    expect(body.totalWeightLb).toBeGreaterThanOrEqual(4);
    expect(Object.keys(cloak ?? {}).sort()).toEqual(
      [
        'attuned',
        'catalog',
        'charges',
        'description',
        'itemId',
        'name',
        'quantity',
        'slot',
        'unidentified',
      ].sort(),
    );
  });

  it("lets the DM read anyone's, and nobody else's through a player", async () => {
    const mira = await get(app, url('mira-vale', 'DM'), TOKENS.dm);
    expect(mira.statusCode).toBe(200);
    expect(mira.json<InventoryResponse>().items[0]?.quantity).toBe(3);
    const hidden = [];
    for (const id of ['mira-vale', 'missing-entity', 'inv-cloak']) {
      const response = await get(app, url(id), TOKENS.player);
      expect(response.statusCode).toBe(404);
      hidden.push(JSON.stringify(withoutRequestId(response)));
    }
    expect(new Set(hidden).size).toBe(1);
  });

  it('keeps carried items out of the other characters sheet and scene views', async () => {
    const response = await get(app, url('mira-vale', 'PARTY'), TOKENS.player);
    expect(response.statusCode).toBe(404);
    expect(response.body).not.toContain('Orin balm');
  });
});

describe('item commands over HTTP', () => {
  const send = (commandId: string, command: Record<string, unknown>, token = TOKENS.player) =>
    post(app, '/campaigns/ravenford/commands', { commandId, command }, token);

  it('lets the controlling player wear and use their own item, and nobody else act for it', async () => {
    const equip = await send('inv-equip', {
      type: 'EquipItem',
      characterId: OWN,
      itemId: 'inv-cloak',
      slot: 'cloak',
    });
    expect(equip.statusCode).toBe(200);
    const worn = await get(app, url(), TOKENS.player);
    expect(worn.json<InventoryResponse>().items[0]?.slot).toBe('cloak');
    // The player cannot grant items, nor act for a character they do not control.
    expect(
      (await send('inv-grant', { type: 'GrantItem', itemId: 'inv-balm', holderId: OWN }))
        .statusCode,
    ).toBe(403);
    expect(
      (
        await send('inv-steal', {
          type: 'UnequipItem',
          characterId: 'mira-vale',
          itemId: 'inv-balm',
        })
      ).statusCode,
    ).toBe(403);
  });
});
