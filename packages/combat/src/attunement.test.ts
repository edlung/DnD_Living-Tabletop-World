import type { CharacterSheet, CommandResult } from '@ltw/contracts';
import { possessionOf } from '@ltw/domain';
import { savingThrowModifier } from '@ltw/rules';
import { describe, expect, it } from 'vitest';

import {
  ELOWEN,
  PLAYER,
  RAIDER_1,
  codeOf,
  recorded,
  roadWorld,
  startAmbush,
  type RoadWorld,
} from './testing/road.ts';
import { verifyHistory } from './testing/verify.ts';

/**
 * Attunement on the Old Trade Road (docs/adr/0054-items-as-data.md §5): Elowen, a ranger and a
 * wizard, attunes to magic items — no more than three, one copy of each, those her classes may —
 * and a worn Ring of Protection gives its +1 to Armor Class and saves only while she is attuned. A
 * cursed axe holds on until the DM lifts the curse.
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
const attune = (world: RoadWorld, itemId: string, attuned: boolean, extra = {}) =>
  world.dm({ type: 'AttuneItem', characterId: ELOWEN, itemId, attuned, ...extra });
const sheetOf = async (world: RoadWorld) =>
  (await world.state()).characterSheets.get(ELOWEN) as CharacterSheet;

describe('attunement', () => {
  it('a worn Ring of Protection gives +1 to Armor Class and saves only while attuned', async () => {
    const world = await roadWorld();
    const before = await sheetOf(world);
    await give(world, 'item-ring', { catalogId: 'srd-ring-of-protection' });
    expect(
      codeOf(
        await world.submit({
          type: 'EquipItem',
          characterId: ELOWEN,
          itemId: 'item-ring',
          slot: 'ring',
        }),
      ),
    ).toBe('accepted');
    expect((await sheetOf(world)).armorClass).toBe(before.armorClass);
    expect(codeOf(await attune(world, 'item-ring', true))).toBe('accepted');
    const attuned = await sheetOf(world);
    expect(attuned.armorClass).toBe(before.armorClass + 1);
    expect(attuned.saveBonus).toBe(1);
    expect(savingThrowModifier(attuned, 'wis')).toBe(savingThrowModifier(before, 'wis') + 1);
    expect(possessionOf(await world.state(), 'item-ring')).toMatchObject({
      attuned: true,
      acDelta: 1,
      saveDelta: 1,
    });
    // Taken off, it gives nothing; attunement stays.
    await world.submit({ type: 'UnequipItem', characterId: ELOWEN, itemId: 'item-ring' });
    expect((await sheetOf(world)).armorClass).toBe(before.armorClass);
    expect((await sheetOf(world)).saveBonus).toBeUndefined();
    expect(possessionOf(await world.state(), 'item-ring')?.attuned).toBe(true);
    expect(codeOf(await attune(world, 'item-ring', false))).toBe('accepted');
    await verifyHistory(world);
  });

  it('no more than three, one copy each, and only who the item names', async () => {
    const world = await roadWorld();
    for (const [id, catalogId] of [
      ['item-a', 'srd-ring-of-protection'],
      ['item-b', 'srd-ring-of-protection'],
      ['item-c', 'srd-cloak-of-protection'],
      ['item-d', 'srd-amulet-of-health'],
      ['item-e', 'srd-boots-of-speed'],
      ['item-f', 'srd-staff-of-healing'],
      ['item-g', 'srd-staff-of-power'],
    ] as const)
      await give(world, id, { catalogId });
    expect(codeOf(await attune(world, 'item-a', true))).toBe('accepted');
    expect(reason(await attune(world, 'item-b', true))).toBe('Already attuned to one of these');
    // A Staff of Healing is a Bard's, a Cleric's or a Druid's; a Staff of Power, a Wizard's too.
    expect(reason(await attune(world, 'item-f', true))).toBe(
      'Only a creature by a Bard, Cleric, or Druid may attune to it',
    );
    expect(codeOf(await attune(world, 'item-g', true))).toBe('accepted');
    expect(codeOf(await attune(world, 'item-c', true))).toBe('accepted');
    expect(reason(await attune(world, 'item-d', true))).toBe(
      'Attuned to three items already: end one first',
    );
    // A player cannot attune by command: the table does it in a Short Rest.
    expect(
      codeOf(
        await world.submit(
          { type: 'AttuneItem', characterId: ELOWEN, itemId: 'item-d', attuned: true },
          PLAYER,
        ),
      ),
    ).not.toBe('accepted');
    await verifyHistory(world);
  });

  it('a cursed Berserker Axe: its +1 only attuned, its attunement only lifted', async () => {
    const world = await roadWorld();
    await give(world, 'item-axe', {
      catalogId: 'srd-berserker-axe',
      baseCatalogId: 'srd-greataxe',
    });
    await world.submit({
      type: 'EquipItem',
      characterId: ELOWEN,
      itemId: 'item-axe',
      slot: 'mainhand',
    });
    expect(codeOf(await attune(world, 'item-axe', true))).toBe('accepted');
    expect(reason(await attune(world, 'item-axe', false))).toBe('A curse holds this attunement');
    await startAmbush(world, undefined, (command) => ({
      ...command,
      combatants: command.combatants.map((one: { entityId: string }) =>
        one.entityId === RAIDER_1 ? { ...one, position: { x: 3, y: 6 } } : one,
      ),
    }));
    world.roll(20, 12);
    const hit = await world.submit({
      type: 'Attack',
      combatantId: ELOWEN,
      attackId: 'greataxe',
      targetId: RAIDER_1,
    });
    const sheet = await sheetOf(world);
    const strength = Math.floor((sheet.abilities.str - 10) / 2);
    expect(
      (await recorded(world, hit)).find((e) => e.type === 'AttackPerformed')?.payload,
    ).toMatchObject({ modifier: strength + 5 + 1 });
    await world.dm({ type: 'EndCombat', encounterId: (await world.encounter()).encounterId });
    const lifted = await attune(world, 'item-axe', false, { liftCurse: true });
    expect(codeOf(lifted)).toBe('accepted');
    expect(
      (await recorded(world, lifted)).find((e) => e.type === 'ItemAttuned')?.payload,
    ).toMatchObject({ attuned: false, liftedCurse: true });
    await verifyHistory(world);
  });
});
