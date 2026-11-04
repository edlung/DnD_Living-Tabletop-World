import { randomUUID } from 'node:crypto';

import type { MerchantOfferResponse } from '@ltw/contracts';
import { describe, expect, it } from 'vitest';

import { get, post, ravenfordApp, seededEngine, TOKENS } from '../testing/ravenford-app.ts';

/**
 * A merchant's offer over HTTP (docs/adr/0057-encounters-maps-loot.md §8), in the ADR 0009 order:
 * the DM and a character at the merchant's place that knows it read the shop; an NPC that keeps
 * none, a character elsewhere and an outsider are answered as not found.
 */
const MIRA = '/campaigns/ravenford/merchants/mira-vale';
const DM = { actorId: 'dm-ravenford', kind: 'user' } as const;

/** Ravenford with Mira Vale a merchant at 150%, a cowl for sale. */
async function shopApp() {
  const engine = await seededEngine();
  const result = await engine.execute({
    commandId: 'test.shop',
    campaignId: 'ravenford',
    actor: DM,
    command: { type: 'SetMerchant', npcId: 'mira-vale', priceFactor: 150 },
  });
  expect(result.status).toBe('accepted');
  const app = await ravenfordApp(engine);
  const given = await post(
    app,
    '/campaigns/ravenford/items/catalog/hooded-cowl/give',
    { requestId: randomUUID(), holderId: 'mira-vale', quantity: 1, forSale: true },
    TOKENS.dm,
  );
  expect(given.statusCode).toBe(200);
  return { app, engine };
}

describe('GET …/merchants/:npcId', () => {
  it('answers in the ADR 0009 order, an NPC with no shop as not found', async () => {
    const app = await ravenfordApp(await seededEngine());
    expect((await get(app, `${MIRA}?perspective=DM`)).statusCode).toBe(401);
    expect((await get(app, `${MIRA}?perspective=DM&x=1`, TOKENS.dm)).statusCode).toBe(400);
    expect((await get(app, `${MIRA}?perspective=DM`, TOKENS.outsider)).statusCode).toBe(404);
    expect((await get(app, `${MIRA}?perspective=DM`, TOKENS.dm)).statusCode).toBe(404);
    expect((await get(app, `${MIRA}?perspective=PLAYER`, TOKENS.player)).statusCode).toBe(404);
  });

  it('shows the DM and the character at its place the wares at the price', async () => {
    const { app } = await shopApp();
    const dm = (await get(app, `${MIRA}?perspective=DM`, TOKENS.dm)).json<MerchantOfferResponse>();
    expect(dm.priceFactor).toBe(150);
    expect(dm.stock.map((item) => [item.catalog?.itemId, item.priceCp])).toEqual([
      ['hooded-cowl', 450],
    ]);
    expect(dm.offers).toEqual([]);
    const shown = await get(app, `${MIRA}?perspective=PLAYER`, TOKENS.player);
    expect(shown.statusCode).toBe(200);
    const player = shown.json<MerchantOfferResponse>();
    expect(player.stock.map((item) => item.priceCp)).toEqual([450]);
    // What Mira would pay for Elowen's own unworn things: half their worth.
    for (const item of player.offers) expect(item.priceCp).toBeGreaterThan(0);
  });

  it('is not found for a character elsewhere', async () => {
    const { app, engine } = await shopApp();
    const moved = await engine.execute({
      commandId: 'test.away',
      campaignId: 'ravenford',
      actor: DM,
      command: {
        type: 'PlaceEntity',
        entityId: 'elowen-starwhisper',
        locationId: 'old-trade-road',
      },
    });
    expect(moved.status).toBe('accepted');
    expect((await get(app, `${MIRA}?perspective=PLAYER`, TOKENS.player)).statusCode).toBe(404);
  });
});
