import type { CommandResult } from '@ltw/contracts';
import { possessionOf } from '@ltw/domain';
import { describe, expect, it } from 'vitest';

import { ELOWEN, codeOf, recorded, roadWorld, type RoadWorld } from './testing/road.ts';
import { verifyHistory } from './testing/verify.ts';

/**
 * Charges and what a carrier knows (docs/adr/0054-items-as-data.md §5) on the Old Trade Road:
 * Elowen's Wand of Magic Missiles comes with its 7 charges, she spends them, and at dawn the wand
 * rolls 1d6 + 1 back; an item given unidentified is learnt by IdentifyItem, once.
 */
const reason = (result: CommandResult) =>
  result.status === 'rejected' ? result.message : result.status;

async function give(world: RoadWorld, itemId: string, grant: Record<string, unknown>) {
  await world.dm({
    type: 'CreateEntity',
    entityId: itemId,
    kind: 'item',
    name: itemId,
    existsSince: null,
  });
  return world.dm({ type: 'GrantItem', itemId, holderId: ELOWEN, ...grant });
}
const use = (world: RoadWorld, charges: number) =>
  world.submit({ type: 'UseItem', characterId: ELOWEN, itemId: 'item-wand', charges });

describe('charges', () => {
  it('a wand spends its charges and regains 1d6 + 1 at dawn, never past its seven', async () => {
    const world = await roadWorld();
    await give(world, 'item-wand', { catalogId: 'srd-wand-of-magic-missiles' });
    expect(possessionOf(await world.state(), 'item-wand')?.charges).toBe(7);
    const spent = await use(world, 3);
    expect(codeOf(spent)).toBe('accepted');
    expect(
      (await recorded(world, spent)).find((e) => e.type === 'ItemChargesSpent')?.payload,
    ).toEqual({ itemId: 'item-wand', holderId: ELOWEN, spent: 3, left: 4 });
    expect(reason(await use(world, 5))).toBe('Not that many charges left');
    world.roll(6, 2);
    const dawn = await world.dm({ type: 'DawnRecharge' });
    expect(codeOf(dawn)).toBe('accepted');
    expect(
      (await recorded(world, dawn)).find((e) => e.type === 'ItemChargesRegained')?.payload,
    ).toMatchObject({ itemId: 'item-wand', rolls: [2], regained: 3, charges: 7 });
    // Full, the next dawn has nothing to give.
    expect(reason(await world.dm({ type: 'DawnRecharge' }))).toBe(
      'No magic item regains charges now',
    );
    await verifyHistory(world);
  });

  it('only a magic item with charges spends them', async () => {
    const world = await roadWorld();
    await give(world, 'item-wand', { catalogId: 'srd-rope' });
    expect(reason(await use(world, 1))).toBe('It has no charges');
  });
});

describe('identifying', () => {
  it('an item given unidentified is learnt once', async () => {
    const world = await roadWorld();
    await give(world, 'item-ring', { catalogId: 'srd-ring-of-protection', unidentified: true });
    expect(possessionOf(await world.state(), 'item-ring')?.unidentified).toBe(true);
    const identify = { type: 'IdentifyItem', characterId: ELOWEN, itemId: 'item-ring' };
    expect(codeOf(await world.dm(identify))).toBe('accepted');
    expect(possessionOf(await world.state(), 'item-ring')?.unidentified).toBeUndefined();
    expect(reason(await world.dm(identify))).toBe('It is known already');
    await verifyHistory(world);
  });
});
