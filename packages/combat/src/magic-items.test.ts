import type { CharacterSheet, CommandResult } from '@ltw/contracts';
import { possessionOf } from '@ltw/domain';
import { describe, expect, it } from 'vitest';

import {
  ELOWEN,
  RAIDER_1,
  codeOf,
  recorded,
  roadWorld,
  startAmbush,
  type RoadWorld,
} from './testing/road.ts';
import { verifyHistory } from './testing/verify.ts';

/**
 * Magic items on the Old Trade Road (docs/adr/0054-items-as-data.md §5): a magic weapon, armor or
 * shield is made on a base the DM names; its +1 adds to attack and damage or to Armor Class; a
 * Potion of Healing rolls its dice.
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
const act = (world: RoadWorld, command: Record<string, unknown>) =>
  world.submit({ characterId: ELOWEN, ...command });
const sheetOf = async (world: RoadWorld) =>
  (await world.state()).characterSheets.get(ELOWEN) as CharacterSheet;

describe('a magic item made on a base', () => {
  it('names its base where it may be made on more than one, and on one it allows', async () => {
    const world = await roadWorld();
    expect(reason(await give(world, 'item-a', { catalogId: 'srd-weapon-plus-1' }))).toBe(
      'Name what "srd-weapon-plus-1" is made on',
    );
    expect(
      reason(
        await give(world, 'item-b', {
          catalogId: 'srd-weapon-plus-1',
          baseCatalogId: 'srd-plate-armor',
        }),
      ),
    ).toBe('"srd-weapon-plus-1" cannot be made on "srd-plate-armor"');
    // A Dagger of Venom is a dagger: its base goes without saying.
    expect(codeOf(await give(world, 'item-c', { catalogId: 'srd-dagger-of-venom' }))).toBe(
      'accepted',
    );
    expect(possessionOf(await world.state(), 'item-c')).toMatchObject({
      catalogId: 'srd-dagger-of-venom',
      baseCatalogId: 'srd-dagger',
    });
    // Twenty +1 arrows stack, as arrows do.
    expect(
      codeOf(
        await give(world, 'item-d', {
          catalogId: 'srd-ammunition-plus-1',
          baseCatalogId: 'srd-arrow',
          quantity: 20,
        }),
      ),
    ).toBe('accepted');
    await verifyHistory(world);
  });

  it('a +1 longsword adds one to the attack and the damage', async () => {
    const world = await roadWorld();
    const sword = await give(world, 'item-sword', {
      catalogId: 'srd-weapon-plus-1',
      baseCatalogId: 'srd-longsword',
    });
    expect(codeOf(sword)).toBe('accepted');
    expect(
      codeOf(await act(world, { type: 'EquipItem', itemId: 'item-sword', slot: 'mainhand' })),
    ).toBe('accepted');
    await startAmbush(world, undefined, (command) => ({
      ...command,
      combatants: command.combatants.map((one: { entityId: string }) =>
        one.entityId === RAIDER_1 ? { ...one, position: { x: 3, y: 6 } } : one,
      ),
    }));
    world.roll(20, 12);
    world.roll(8, 5);
    const hit = await world.submit({
      type: 'Attack',
      combatantId: ELOWEN,
      attackId: 'longsword',
      targetId: RAIDER_1,
    });
    expect(codeOf(hit)).toBe('accepted');
    const events = await recorded(world, hit);
    const attack = events.find((e) => e.type === 'AttackPerformed')?.payload as
      { modifier: number; total: number } | undefined;
    const sheet = await sheetOf(world);
    // Proficiency and the better of Strength and Dexterity (Versatile, not Finesse: Strength), +1.
    const strength = Math.floor((sheet.abilities.str - 10) / 2);
    const proficiency = 5;
    expect(attack?.modifier).toBe(strength + proficiency + 1);
    const damage = events.find((e) => e.type === 'DamageApplied')?.payload as
      { amount: number } | undefined;
    if (damage) expect(damage.amount).toBeGreaterThanOrEqual(5 + strength + 1);
    await verifyHistory(world);
  });
});

describe('magic armor and shields', () => {
  it('a +1 shield adds three to Armor Class, a +1 chain mail one more than chain mail', async () => {
    const world = await roadWorld();
    const before = (await sheetOf(world)).armorClass;
    await give(world, 'item-shield', { catalogId: 'srd-shield-plus-1' });
    expect(
      codeOf(await act(world, { type: 'EquipItem', itemId: 'item-shield', slot: 'offhand' })),
    ).toBe('accepted');
    expect((await sheetOf(world)).armorClass).toBe(before + 3);
    await give(world, 'item-mail', { catalogId: 'srd-chain-mail' });
    await give(world, 'item-magic-mail', {
      catalogId: 'srd-armor-plus-1',
      baseCatalogId: 'srd-chain-mail',
    });
    expect(codeOf(await act(world, { type: 'EquipItem', itemId: 'item-mail', slot: 'body' }))).toBe(
      'accepted',
    );
    const mundane = (await sheetOf(world)).armorClass;
    expect(codeOf(await act(world, { type: 'UnequipItem', itemId: 'item-mail' }))).toBe('accepted');
    expect(
      codeOf(await act(world, { type: 'EquipItem', itemId: 'item-magic-mail', slot: 'body' })),
    ).toBe('accepted');
    expect((await sheetOf(world)).armorClass).toBe(mundane + 1);
    await verifyHistory(world);
  });
});

describe('a Potion of Healing', () => {
  it('rolls its dice: the greater one heals 4d4 + 4', async () => {
    const world = await roadWorld();
    await world.dm({
      type: 'AdjustHitPoints',
      targetId: ELOWEN,
      change: 'damage',
      amount: 40,
      damageType: 'bludgeoning',
      reason: 'A fall',
    });
    const hurt = (await sheetOf(world)).hitPoints.current;
    await give(world, 'item-potion', { catalogId: 'srd-potion-of-healing-greater', quantity: 2 });
    world.roll(4, 4, 3, 2, 1);
    const drunk = await act(world, { type: 'UseItem', itemId: 'item-potion' });
    expect(codeOf(drunk)).toBe('accepted');
    expect(
      (await recorded(world, drunk)).find((e) => e.type === 'ItemUsed')?.payload,
    ).toMatchObject({ remaining: 1, healed: { rolls: [4, 3, 2, 1], bonus: 4, total: 14 } });
    expect((await sheetOf(world)).hitPoints.current).toBe(hurt + 14);
    await verifyHistory(world);
  });
});
