import { beforeEach, describe, expect, it } from 'vitest';

import {
  PLAYER,
  createHarness,
  expectAccepted,
  expectRejected,
  seedBasicWorld,
  type Harness,
} from '../kernel/testing/kernel-harness.ts';
import { checkWorldIntegrity } from '../kernel/projections/integrity.ts';
import { resolvePerspective } from '../knowledge/perspective.ts';
import { purseCp } from './purse.ts';
import { possessionOf } from './records.ts';
import { merchantOffer } from './trade-view.ts';

/**
 * Merchants (docs/adr/0057-encounters-maps-loot.md §8): the DM makes Mira a merchant at 150% of the
 * worth; she carries a caravan cloak (six crowns' worth). The hero, with twenty crowns, buys it
 * at nine — her crowns spent and the change made — and sells her mail at half its worth. No one
 * elsewhere, and no coin, trades; nothing is bought past the purse. A merchant the hero does not
 * know shows no shop.
 */
let harness: Harness;

const create = (entityId: string, kind: string, extra: Record<string, unknown> = {}) => ({
  type: 'CreateEntity',
  entityId,
  kind,
  name: entityId,
  existsSince: null,
  ...extra,
});
const at = (locationId: string) => ({ placement: { locationId, since: null } });
const grant = (itemId: string, holderId: string, catalogId: string, quantity = 1) => ({
  type: 'GrantItem',
  itemId,
  holderId,
  catalogId,
  quantity,
});
const act = (command: Record<string, unknown>) =>
  harness.submit({ characterId: 'hero', ...command }, { actor: PLAYER });

beforeEach(async () => {
  harness = createHarness();
  await seedBasicWorld(harness);
  for (const command of [
    create('hero', 'character', at('square')),
    create('mira', 'npc', at('square')),
    create('innkeeper', 'npc', at('inn')),
    create('cloaks', 'item'),
    create('ledger', 'item'),
    create('purse', 'item'),
    create('mail', 'item'),
    { type: 'AssignCharacter', characterId: 'hero', playerActorId: PLAYER.actorId },
    { ...grant('cloaks', 'mira', 'caravan-cloak'), forSale: true },
    // Her own: never for sale.
    grant('ledger', 'mira', 'hooded-cowl'),
    grant('purse', 'hero', 'gold-crown', 20),
    grant('mail', 'hero', 'watchman-mail'),
    // Everyone knows Mira's stall; no one knows of the stranger in the crowd.
    {
      type: 'AddKnowledge',
      scope: { kind: 'PUBLIC' },
      knowledgeType: 'FACT',
      statement: 'Mira keeps a stall on the square.',
      subjects: ['mira'],
      knownSince: null,
    },
  ])
    expectAccepted(await harness.submit(command));
});

/** The shop as the hero sees it. */
async function heroOffer(npcId: string) {
  const state = await harness.state();
  const access = resolvePerspective(state, PLAYER, { kind: 'PLAYER' });
  if (!access.ok) throw new Error(access.reason);
  return merchantOffer(state, access.perspective, npcId);
}

describe('a merchant', () => {
  it('is the DM’s to make, of an NPC', async () => {
    expectRejected(
      await harness.submit(
        { type: 'SetMerchant', npcId: 'mira', priceFactor: 150 },
        { actor: PLAYER },
      ),
      'FORBIDDEN',
    );
    expectRejected(
      await harness.submit({ type: 'SetMerchant', npcId: 'hero', priceFactor: 150 }),
      'ENTITY_NOT_FOUND',
    );
    expectAccepted(await harness.submit({ type: 'SetMerchant', npcId: 'mira', priceFactor: 150 }));
    expect((await harness.state()).merchants.get('mira')).toEqual({ priceFactor: 150 });
  });

  it('sells at its price, the change made, and buys at half the worth', async () => {
    expectAccepted(await harness.submit({ type: 'SetMerchant', npcId: 'mira', priceFactor: 150 }));
    const offer = await heroOffer('mira');
    expect(offer?.stock.map((item) => item.itemId)).toEqual(['cloaks']);
    const cloakWorth = offer?.stock[0]?.priceCp ?? 0;
    expect(offer?.purseCp).toBe(2_000);
    expectAccepted(await act({ type: 'BuyItem', merchantId: 'mira', itemId: 'cloaks' }));
    let state = await harness.state();
    expect(checkWorldIntegrity(state)).toEqual([]);
    expect(possessionOf(state, 'cloaks')?.holderId).toBe('hero');
    expect(purseCp(state, 'hero')).toBe(2_000 - cloakWorth);
    // Sold at half the mail's worth, paid into her crowns' stack where the coins allow.
    const mailWorth = offer?.offers.find((one) => one.itemId === 'mail')?.priceCp ?? 0;
    expect(mailWorth).toBeGreaterThan(0);
    expectAccepted(await act({ type: 'SellItem', merchantId: 'mira', itemId: 'mail' }));
    state = await harness.state();
    expect(checkWorldIntegrity(state)).toEqual([]);
    // Bought, the mail is her wares now.
    expect(possessionOf(state, 'mail')).toMatchObject({ holderId: 'mira', forSale: true });
    expect(possessionOf(state, 'cloaks')?.forSale).toBeUndefined();
    expect(purseCp(state, 'hero')).toBe(2_000 - cloakWorth + mailWorth);
  });

  it('is shown only to a character at its place that knows it', async () => {
    for (const command of [
      create('stranger', 'npc', at('square')),
      { type: 'SetMerchant', npcId: 'stranger', priceFactor: 100 },
      { type: 'SetMerchant', npcId: 'mira', priceFactor: 100 },
      { type: 'SetMerchant', npcId: 'innkeeper', priceFactor: 100 },
    ])
      expectAccepted(await harness.submit(command));
    expect(await heroOffer('mira')).not.toBeNull();
    // Unknown to the hero, or elsewhere: as for an NPC that keeps no shop.
    expect(await heroOffer('stranger')).toBeNull();
    expect(await heroOffer('innkeeper')).toBeNull();
    expect(await heroOffer('hero')).toBeNull();
  });

  it('trades with no one elsewhere, never coins, and never past the purse', async () => {
    expectAccepted(await harness.submit({ type: 'SetMerchant', npcId: 'mira', priceFactor: 500 }));
    expectAccepted(
      await harness.submit({ type: 'SetMerchant', npcId: 'innkeeper', priceFactor: 100 }),
    );
    expectRejected(
      await act({ type: 'SellItem', merchantId: 'innkeeper', itemId: 'mail' }),
      'NOT_PRESENT',
    );
    expectRejected(
      await act({ type: 'SellItem', merchantId: 'mira', itemId: 'purse' }),
      'INVALID_ITEM',
    );
    // Twenty crowns do not pay five times a cloak's worth.
    const refused = await act({ type: 'BuyItem', merchantId: 'mira', itemId: 'cloaks' });
    expect(refused.status === 'rejected' ? refused.message : refused.status).toBe(
      'NOT_ENOUGH_COINS',
    );
  });
});
