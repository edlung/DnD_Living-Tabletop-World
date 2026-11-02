import type { StatBlock } from '@ltw/contracts';
import { describe, expect, it } from 'vitest';

import { DM, ELOWEN, RAIDER_1, codeOf, recorded, roadWorld, startAmbush } from './testing/road.ts';
import { verifyHistory } from './testing/verify.ts';

/**
 * A stat block's added damage and condition immunities (docs/adr/0053-monsters-as-data.md §1) on
 * the Old Trade Road: Raider 1's scimitar adds 1d6 Fire, and it cannot be knocked Prone.
 */
async function burning() {
  const world = await roadWorld();
  const block = (await world.state()).statBlocks.get(RAIDER_1) as StatBlock;
  const statBlock: StatBlock = {
    ...block,
    attacks: block.attacks.map((attack) => ({
      ...attack,
      reachFt: attack.kind === 'melee' ? 30 : attack.reachFt,
      extraDamage: [{ count: 1, sides: 6, bonus: 0, type: 'fire' }],
    })),
    conditionImmunities: ['prone'],
  };
  expect(codeOf(await world.dm({ type: 'SetStatBlock', entityId: RAIDER_1, statBlock }))).toBe(
    'accepted',
  );
  await startAmbush(world);
  return world;
}

describe('a stat block from the catalog', () => {
  it('adds its fire to a hit, each damage with its own type', async () => {
    const world = await burning();
    // On to Raider 1's turn.
    for (let step = 0; step < 6; step += 1) {
      const encounter = await world.encounter();
      const current = encounter.combatants[encounter.currentIndex]?.entityId;
      if (current === RAIDER_1) break;
      await world.dm({ type: 'EndTurn', combatantId: current });
    }
    const melee = (await world.state()).statBlocks
      .get(RAIDER_1)
      ?.attacks.find((attack) => attack.kind === 'melee');
    world.roll(20, 19);
    const hit = await world.dm({
      type: 'Attack',
      combatantId: RAIDER_1,
      attackId: melee?.attackId,
      targetId: ELOWEN,
    });
    expect(codeOf(hit)).toBe('accepted');
    const damage = (await recorded(world, hit)).filter((e) => e.type === 'DamageApplied');
    expect(damage.map((e) => e.payload.damageType)).toEqual([melee?.damage.type, 'fire']);
    await verifyHistory(world);
  });

  it('takes no condition it is immune to', async () => {
    const world = await burning();
    const prone = await world.dm({
      type: 'SetCondition',
      targetId: RAIDER_1,
      condition: 'prone',
      applied: true,
      reason: 'A shove',
    });
    expect(codeOf(prone)).toBe('NO_EFFECT');
    expect(DM.kind).toBe('user');
  });
});
