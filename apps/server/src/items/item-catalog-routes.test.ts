import { randomUUID } from 'node:crypto';

import {
  ITEM_CATALOG,
  type GivenCatalogItemResponse,
  type InventoryResponse,
  type ItemCatalogEntryResponse,
  type ItemCatalogResponse,
} from '@ltw/contracts';
import { SRD_ITEM_CATALOG } from '@ltw/contracts/srd-items';
import { describe, expect, it } from 'vitest';

import { get, post, ravenfordApp, seededEngine, TOKENS } from '../testing/ravenford-app.ts';

/**
 * The DM's item catalog (docs/adr/0054-items-as-data.md §4): Ravenford's entries and the SRD's,
 * for the DM alone; one given is a new item its holder carries, once per request, and a gift the
 * World Engine would refuse makes nothing.
 */
const BASE = '/campaigns/ravenford';
const LIST = `${BASE}/items/catalog`;
const ELOWEN = 'elowen-starwhisper';
const INVENTORY = `${BASE}/entities/${ELOWEN}/inventory?perspective=DM`;

describe('the item catalog', () => {
  it('lists Ravenford’s entries and the SRD’s, and one’s words, for the DM alone', async () => {
    const app = await ravenfordApp();
    expect((await get(app, LIST)).statusCode).toBe(401);
    expect((await get(app, LIST, TOKENS.player)).statusCode).toBe(403);
    const listed = (await get(app, LIST, TOKENS.dm)).json<ItemCatalogResponse>();
    expect(listed.items).toHaveLength(ITEM_CATALOG.length + SRD_ITEM_CATALOG.length);
    expect(listed.items.find((item) => item.itemId === 'srd-chain-mail')).toEqual({
      itemId: 'srd-chain-mail',
      name: { ru: 'Chain Mail', en: 'Chain Mail' },
      category: 'armor',
      valueCp: 7500,
      weightLb: 55,
      stackable: false,
      source: 'srd',
      look: 'armor',
      untranslated: true,
      rarity: null,
      attunement: null,
      base: null,
    });
    // A magic item: its rarity, who attunes, what it may be made on, and its words.
    expect(listed.items.find((item) => item.itemId === 'srd-berserker-axe')).toMatchObject({
      rarity: 'rare',
      attunement: '',
      base: { kind: 'weapon', allowed: ['srd-battleaxe', 'srd-greataxe', 'srd-halberd'] },
    });
    const ring = (
      await get(app, `${LIST}/srd-ring-of-protection`, TOKENS.dm)
    ).json<ItemCatalogEntryResponse>();
    expect(ring.magic?.text).toMatch(/\+1 bonus to Armor Class and saving throws/);
    const rope = (await get(app, `${LIST}/srd-rope`, TOKENS.dm)).json<ItemCatalogEntryResponse>();
    expect(rope.srd?.text).toMatch(/^As a Utilize action, you can tie a knot/);
    const own = (await get(app, `${LIST}/hemp-rope`, TOKENS.dm)).json<ItemCatalogEntryResponse>();
    expect(own.srd).toBeNull();
    expect(own.item.source).toBeNull();
    expect((await get(app, `${LIST}/srd-no-such-thing`, TOKENS.dm)).statusCode).toBe(404);
    expect((await get(app, `${LIST}/Not A Slug`, TOKENS.dm)).statusCode).toBe(400);
  });

  it('gives an item once per request, its SRD words in the inventory', async () => {
    const engine = await seededEngine();
    const app = await ravenfordApp(engine);
    const request = { requestId: randomUUID(), holderId: ELOWEN };
    const given = await post(app, `${LIST}/srd-rope/give`, request, TOKENS.dm);
    expect(given.statusCode).toBe(200);
    const item = given.json<GivenCatalogItemResponse>();
    expect(item.itemId).toMatch(/^item-[0-9a-f]{8}$/);
    expect((await post(app, `${LIST}/srd-rope/give`, request, TOKENS.dm)).json()).toEqual(item);
    const inventory = (await get(app, INVENTORY, TOKENS.dm)).json<InventoryResponse>();
    const ropes = inventory.items.filter((one) => one.catalog?.itemId === 'srd-rope');
    expect(ropes).toHaveLength(1);
    expect(ropes[0]).toMatchObject({
      itemId: item.itemId,
      name: 'Rope',
      catalog: { source: 'srd', untranslated: true },
    });
    expect(ropes[0]?.catalog?.text).toMatch(/^As a Utilize action/);
    // A +1 longsword: made on the longsword the DM names, and named so.
    const sword = await post(
      app,
      `${LIST}/srd-weapon-plus-1/give`,
      { requestId: randomUUID(), holderId: ELOWEN, baseCatalogId: 'srd-longsword' },
      TOKENS.dm,
    );
    expect(sword.statusCode).toBe(200);
    const swords = (await get(app, INVENTORY, TOKENS.dm))
      .json<InventoryResponse>()
      .items.filter((one) => one.catalog?.itemId === 'srd-weapon-plus-1');
    expect(swords[0]).toMatchObject({ name: 'Longsword, +1', catalog: { weapon: 'longsword' } });
    expect(swords[0]?.catalog?.text).toMatch(/bonus to attack rolls and damage rolls/);
    // Twenty arrows at once: they stack.
    const arrows = await post(
      app,
      `${LIST}/srd-arrow/give`,
      { requestId: randomUUID(), holderId: ELOWEN, quantity: 20 },
      TOKENS.dm,
    );
    expect(arrows.statusCode).toBe(200);
    expect((await post(app, `${LIST}/srd-rope/give`, request, TOKENS.player)).statusCode).toBe(403);
  });

  it('makes nothing when the World Engine would refuse the gift', async () => {
    const engine = await seededEngine();
    const app = await ravenfordApp(engine);
    const before = (await engine.load('ravenford'))?.state.entities.size;
    // Three longswords: a longsword does not stack.
    const many = await post(
      app,
      `${LIST}/srd-longsword/give`,
      { requestId: randomUUID(), holderId: ELOWEN, quantity: 3 },
      TOKENS.dm,
    );
    expect(many.statusCode).toBe(422);
    expect(many.json()).toMatchObject({ status: 'rejected', code: 'INVALID_ITEM' });
    // A +1 weapon on nothing named, or on armor, is refused.
    for (const base of [undefined, 'srd-plate-armor'])
      expect(
        (
          await post(
            app,
            `${LIST}/srd-weapon-plus-1/give`,
            { requestId: randomUUID(), holderId: ELOWEN, ...(base ? { baseCatalogId: base } : {}) },
            TOKENS.dm,
          )
        ).statusCode,
      ).toBe(422);
    expect((await engine.load('ravenford'))?.state.entities.size).toBe(before);
    // A place takes treasure: the sword lies there (docs/adr/0057-encounters-maps-loot.md §7).
    const place = await post(
      app,
      `${LIST}/srd-longsword/give`,
      { requestId: randomUUID(), holderId: 'old-trade-road' },
      TOKENS.dm,
    );
    expect(place.statusCode).toBe(200);
    const { itemId } = place.json<{ itemId: string }>();
    const state = (await engine.load('ravenford'))?.state;
    expect(state?.possessions.get(itemId)?.holderId).toBeNull();
    expect(state?.entities.get(itemId)?.placement?.locationId).toBe('old-trade-road');
  });
});
