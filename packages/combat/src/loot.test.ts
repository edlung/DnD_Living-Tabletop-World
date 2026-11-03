import { possessionOf } from '@ltw/domain';
import { describe, expect, it } from 'vitest';

import { ELOWEN, RAIDER_1, codeOf, roadWorld, startAmbush } from './testing/road.ts';
import { verifyHistory } from './testing/verify.ts';

/**
 * What the fallen carried (docs/adr/0057-encounters-maps-loot.md §7): Raider 1 carries a purse the
 * DM gave it; it falls in the ambush; as the fight ends its purse lies on the Old Trade Road, and
 * Elowen picks it up. Nothing is taken while the fight runs.
 */
describe('the fallen’s belongings', () => {
  it('lie where the fight was once it ends, for the party to take', async () => {
    const world = await roadWorld();
    await world.dm({
      type: 'CreateEntity',
      entityId: 'raider-purse',
      kind: 'item',
      name: 'A greasy purse',
      existsSince: null,
    });
    const given = await world.dm({
      type: 'GrantItem',
      itemId: 'raider-purse',
      holderId: RAIDER_1,
      catalogId: 'gold-crown',
      quantity: 12,
    });
    expect(codeOf(given)).toBe('accepted');
    await startAmbush(world);
    const felled = await world.dm({
      type: 'AdjustHitPoints',
      targetId: RAIDER_1,
      change: 'damage',
      amount: 999,
      damageType: 'force',
      reason: 'The raider falls',
    });
    expect(codeOf(felled)).toBe('accepted');
    expect((await world.state()).entities.get(RAIDER_1)?.status).toBe('dead');
    // Still on the body while the fight runs.
    expect(possessionOf(await world.state(), 'raider-purse')?.holderId).toBe(RAIDER_1);
    const { encounterId } = await world.encounter();
    expect(codeOf(await world.dm({ type: 'EndCombat', encounterId }))).toBe('accepted');
    const after = await world.state();
    expect(possessionOf(after, 'raider-purse')).toMatchObject({ holderId: null, quantity: 12 });
    expect(after.entities.get('raider-purse')?.placement?.locationId).toBe('old-trade-road');
    const taken = await world.submit({
      type: 'TakeItem',
      characterId: ELOWEN,
      itemId: 'raider-purse',
    });
    expect(codeOf(taken)).toBe('accepted');
    expect(possessionOf(await world.state(), 'raider-purse')?.holderId).toBe(ELOWEN);
    await verifyHistory(world);
  });
});
