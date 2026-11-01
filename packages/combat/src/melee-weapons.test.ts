import { describe, expect, it } from 'vitest';

import {
  ELOWEN,
  RAIDER_2,
  codeOf,
  recorded,
  roadWorld,
  startAmbush,
  type RoadWorld,
} from './testing/road.ts';

/**
 * Weapons in hand (Stage 520): a character attacks with the weapon items it wields beside its
 * sheet's weapons; a finesse weapon takes the better of Strength and Dexterity; reach is 5 ft.
 */
async function armed(world: RoadWorld, wield: boolean): Promise<void> {
  await world.dm({
    type: 'CreateEntity',
    entityId: 'blade-1',
    kind: 'item',
    name: 'Short blade',
    existsSince: null,
  });
  await world.dm({
    type: 'GrantItem',
    itemId: 'blade-1',
    holderId: ELOWEN,
    catalogId: 'ranger-shortsword',
  });
  if (wield) {
    const equipped = await world.submit({
      type: 'EquipItem',
      characterId: ELOWEN,
      itemId: 'blade-1',
      slot: 'mainhand',
    });
    expect(codeOf(equipped)).toBe('accepted');
  }
}

/** The ambush with Elowen standing beside Raider 2 (at 10, 7). */
const beside = (world: RoadWorld, x = 9) =>
  startAmbush(world, undefined, (command) => ({
    ...command,
    combatants: command.combatants.map((entry) =>
      entry.entityId === ELOWEN ? { ...entry, position: { x, y: 7 } } : entry,
    ),
  }));

describe('melee weapons in hand', () => {
  it('strikes an adjacent foe with the wielded short blade, Dexterity for finesse', async () => {
    const world = await roadWorld();
    await armed(world, true);
    await beside(world);
    world.roll(20, 15);
    world.roll(6, 4);
    const result = await world.submit({
      type: 'Attack',
      combatantId: ELOWEN,
      attackId: 'shortsword',
      targetId: RAIDER_2,
    });
    expect(codeOf(result)).toBe('accepted');
    const events = await recorded(world, result);
    const attack = events.find((event) => event.type === 'AttackPerformed');
    // Dexterity +4 (better than Strength +0) and proficiency +5; no Archery for a melee weapon.
    expect(attack?.payload).toMatchObject({
      attackId: 'shortsword',
      rolls: [15],
      modifier: 9,
      total: 24,
      hit: true,
    });
    const damage = events.find((event) => event.type === 'DamageApplied');
    expect(damage?.payload).toMatchObject({ rolls: [4], amount: 8, damageType: 'piercing' });
  });

  it('refuses a blade not in hand, and asks to close the distance when out of reach', async () => {
    const carried = await roadWorld();
    await armed(carried, false);
    await beside(carried);
    const unarmed = await carried.submit({
      type: 'Attack',
      combatantId: ELOWEN,
      attackId: 'shortsword',
      targetId: RAIDER_2,
    });
    expect(unarmed.status === 'rejected' ? unarmed.message : unarmed.status).toBe('NO_WEAPON');

    const far = await roadWorld();
    await armed(far, true);
    await beside(far, 7);
    const reach = await far.submit({
      type: 'Attack',
      combatantId: ELOWEN,
      attackId: 'shortsword',
      targetId: RAIDER_2,
    });
    expect(reach.status === 'rejected' ? reach.message : reach.status).toBe('OUT_OF_RANGE');
  });
});
