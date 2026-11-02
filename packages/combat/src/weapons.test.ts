import type { CharacterSheet, WeaponId } from '@ltw/contracts';
import { describe, expect, it } from 'vitest';

import {
  ELOWEN,
  RAIDER_1,
  RAIDER_2,
  codeOf,
  recorded,
  roadWorld,
  startAmbush,
  type RoadWorld,
} from './testing/road.ts';
import { verifyHistory } from './testing/verify.ts';

/**
 * The weapons' properties, ammunition and the other hand (docs/adr/0047-weapons.md §1, §4, §5),
 * through the World Engine. Elowen stands at (2, 6); the Raiders have AC 15 and 10 HP. Remade as a
 * fighter of level 5 she has Strength 16, Dexterity 14, two attacks and +3 proficiency.
 */
const raiderAt =
  (x: number, y: number, raider = RAIDER_1) =>
  (command: { combatants: { entityId: string }[] } & Record<string, unknown>) => ({
    ...command,
    combatants: command.combatants.map((c) =>
      c.entityId === raider ? { ...c, position: { x, y } } : c,
    ),
  });

async function reshape(world: RoadWorld, change: (sheet: CharacterSheet) => CharacterSheet) {
  const sheet = (await world.state()).characterSheets.get(ELOWEN);
  if (!sheet) throw new Error('no sheet');
  const set = await world.dm({ type: 'SetCharacterSheet', entityId: ELOWEN, sheet: change(sheet) });
  expect(codeOf(set)).toBe('accepted');
}

const fighter =
  (weapons: WeaponId[], changes: Partial<CharacterSheet> = {}) =>
  (sheet: CharacterSheet): CharacterSheet => ({
    ...sheet,
    classes: [{ classId: 'fighter', level: 5 }],
    abilities: { ...sheet.abilities, str: 16, dex: 14 },
    attacksPerAction: 2,
    weapons,
    ...changes,
  });

let items = 0;
/** An item of the catalog for Elowen, worn in a slot or carried. */
async function give(world: RoadWorld, catalogId: string, quantity = 1, slot?: string) {
  items += 1;
  const itemId = `item-test-${String(items)}`;
  const steps = [
    {
      type: 'CreateEntity',
      entityId: itemId,
      kind: 'item',
      name: catalogId,
      description: 'A test item.',
      existsSince: null,
    },
    { type: 'GrantItem', itemId, holderId: ELOWEN, catalogId, quantity },
    ...(slot ? [{ type: 'EquipItem', characterId: ELOWEN, itemId, slot }] : []),
  ];
  for (const step of steps) expect(codeOf(await world.dm(step)), step.type).toBe('accepted');
  return itemId;
}

/** A rules refusal's reason (`ILLEGAL_ACTION` carries it as its message), or the status. */
const reasonOf = (result: Awaited<ReturnType<RoadWorld['submit']>>) =>
  result.status === 'rejected' ? result.message : result.status;

const attack = (attackId: string, targetId = RAIDER_1, more: Record<string, unknown> = {}) => ({
  type: 'Attack',
  combatantId: ELOWEN,
  attackId,
  targetId,
  ...more,
});
const performed = async (world: RoadWorld, result: Awaited<ReturnType<RoadWorld['submit']>>) =>
  (await recorded(world, result)).find((event) => event.type === 'AttackPerformed')?.payload;
const hp = async (world: RoadWorld, id = RAIDER_1) =>
  (await world.state()).statBlocks.get(id)?.hitPoints.current;

describe('reach, weight and grip', () => {
  it('a Reach weapon strikes at 10 ft, where a sword must close in', async () => {
    const world = await roadWorld();
    await startAmbush(world, undefined, raiderAt(4, 6));
    await reshape(world, fighter(['glaive', 'longsword']));
    world.roll(20, 15);
    world.roll(10, 6);
    const struck = await world.submit(attack('glaive'));
    expect(codeOf(struck)).toBe('accepted');
    expect(await performed(world, struck)).toMatchObject({ hit: true, disadvantage: false });
    expect(await hp(world)).toBe(10 - 9);
    expect(reasonOf(await world.submit(attack('longsword')))).toBe('OUT_OF_RANGE');
  });

  it('a Heavy weapon has Disadvantage in a wielder below Strength 13', async () => {
    const world = await roadWorld();
    await startAmbush(world, undefined, raiderAt(3, 6));
    await reshape(world, (sheet) => ({
      ...fighter(['greatsword'])(sheet),
      abilities: { ...sheet.abilities, str: 12, dex: 14 },
    }));
    world.roll(20, 15, 15);
    world.roll(6, 1, 1);
    const swung = await world.submit(attack('greatsword'));
    expect(await performed(world, swung)).toMatchObject({ disadvantage: true });
  });

  it('a Versatile weapon rolls its larger die in two hands, its smaller beside a shield', async () => {
    const world = await roadWorld();
    await startAmbush(world, undefined, raiderAt(3, 6));
    await reshape(world, fighter(['longsword']));
    world.roll(20, 15);
    world.roll(10, 4);
    const twoHands = await world.submit(attack('longsword'));
    expect(await performed(world, twoHands)).toMatchObject({ grip: 'two-handed' });
    expect(await hp(world)).toBe(10 - 7);

    const shielded = await roadWorld();
    await give(shielded, 'oak-buckler', 1, 'offhand');
    await startAmbush(shielded, undefined, raiderAt(3, 6));
    await reshape(shielded, fighter(['longsword']));
    shielded.roll(20, 15);
    shielded.roll(8, 4);
    const oneHand = await shielded.submit(attack('longsword'));
    expect(await performed(shielded, oneHand)).not.toHaveProperty('grip');
    expect(await hp(shielded)).toBe(10 - 7);
    // Both hands are needed for a Two-Handed weapon: the shield is in one.
    await reshape(shielded, fighter(['longsword', 'greataxe']));
    expect(reasonOf(await shielded.submit(attack('greataxe')))).toBe('HANDS_FULL');
  });
});

describe('thrown and ranged', () => {
  it('a dagger beyond reach is thrown, as far as 60 ft', async () => {
    const world = await roadWorld();
    await startAmbush(world, undefined, raiderAt(5, 6));
    await reshape(world, fighter(['dagger']));
    world.roll(20, 15);
    world.roll(4, 2);
    const thrown = await world.submit(attack('dagger'));
    expect(await performed(world, thrown)).toMatchObject({ thrown: true, hit: true });
    expect(await hp(world)).toBe(10 - 5);

    const far = await roadWorld();
    await startAmbush(far, undefined, raiderAt(15, 6));
    await reshape(far, fighter(['dagger']));
    expect(reasonOf(await far.submit(attack('dagger')))).toBe('OUT_OF_RANGE');
  });

  it('a ranged attack with a foe beside has Disadvantage', async () => {
    const world = await roadWorld();
    await startAmbush(world, undefined, raiderAt(3, 6));
    world.roll(20, 15, 15);
    world.roll(8, 1);
    const shot = await world.submit(attack('longbow', RAIDER_2));
    expect(await performed(world, shot)).toMatchObject({ disadvantage: true });
  });

  it('a Loading weapon fires once an action, whatever Extra Attack allows', async () => {
    const world = await roadWorld();
    await startAmbush(world);
    await reshape(world, fighter(['light-crossbow']));
    world.roll(20, 15);
    world.roll(8, 1);
    expect(codeOf(await world.submit(attack('light-crossbow')))).toBe('accepted');
    expect(reasonOf(await world.submit(attack('light-crossbow')))).toBe('LOADING');
  });
});

describe('ammunition', () => {
  it('a shot spends a counted arrow; with none left the bow cannot fire', async () => {
    const world = await roadWorld();
    const quiver = await give(world, 'goose-fletched-arrows', 1);
    await startAmbush(world);
    world.roll(20, 2);
    const shot = await world.submit(attack('longbow'));
    expect((await recorded(world, shot)).find((e) => e.type === 'ItemUsed')?.payload).toEqual({
      itemId: quiver,
      holderId: ELOWEN,
      remaining: 0,
    });
    expect(reasonOf(await world.submit(attack('longbow')))).toBe('NO_AMMUNITION');
  });

  it('half of what was spent comes back as the fight ends', async () => {
    const world = await roadWorld();
    const quiver = await give(world, 'goose-fletched-arrows', 4);
    await startAmbush(world);
    world.roll(20, 2, 2);
    await world.submit(attack('longbow'));
    await world.submit(attack('longbow'));
    expect((await world.state()).possessions.get(quiver)?.quantity).toBe(2);
    const encounterId = (await world.encounter()).encounterId;
    const ended = await world.dm({ type: 'EndCombat', encounterId });
    expect((await recorded(world, ended)).find((e) => e.type === 'ItemRecovered')?.payload).toEqual(
      { itemId: quiver, holderId: ELOWEN, recovered: 1, quantity: 3 },
    );
    expect((await world.state()).possessions.get(quiver)?.quantity).toBe(3);
    await verifyHistory(world);
  });

  it('uncounted ammunition never runs out', async () => {
    const world = await roadWorld();
    await startAmbush(world);
    world.roll(20, 2, 2);
    expect(codeOf(await world.submit(attack('longbow')))).toBe('accepted');
    expect(codeOf(await world.submit(attack('longbow')))).toBe('accepted');
  });
});

describe('the other hand', () => {
  it('a Light weapon after the Attack action’s Light one: a Bonus Action, no modifier to damage', async () => {
    const world = await roadWorld();
    await startAmbush(world, undefined, raiderAt(3, 6));
    await reshape(world, fighter(['shortsword', 'handaxe']));
    expect(reasonOf(await world.submit(attack('handaxe', RAIDER_1, { extra: 'offhand' })))).toBe(
      'NO_EXTRA_ATTACK',
    );
    world.roll(20, 2);
    await world.submit(attack('shortsword'));
    world.roll(20, 15);
    world.roll(6, 4);
    const second = await world.submit(attack('handaxe', RAIDER_1, { extra: 'offhand' }));
    expect(await performed(world, second)).toMatchObject({ by: 'offhand', hit: true });
    expect(await hp(world)).toBe(10 - 4);
    const elowen = (await world.encounter()).combatants.find((c) => c.entityId === ELOWEN);
    expect(elowen?.turn).toMatchObject({
      bonusActionUsed: true,
      attacksRemaining: 1,
      offhandAttacked: true,
    });
    expect(reasonOf(await world.submit(attack('handaxe', RAIDER_1, { extra: 'offhand' })))).toBe(
      'NO_EXTRA_ATTACK',
    );
    await verifyHistory(world);
  });

  it('Nick makes it part of the Attack action; the same weapon needs a second in hand', async () => {
    const world = await roadWorld();
    await startAmbush(world, undefined, raiderAt(3, 6));
    await reshape(world, fighter(['shortsword', 'scimitar']));
    expect(codeOf(await world.submit(attack('shortsword')))).toBe('accepted');
    expect(reasonOf(await world.submit(attack('shortsword', RAIDER_1, { extra: 'offhand' })))).toBe(
      'NO_EXTRA_ATTACK',
    );
    expect(codeOf(await world.submit(attack('scimitar', RAIDER_1, { extra: 'offhand' })))).toBe(
      'accepted',
    );
    const elowen = (await world.encounter()).combatants.find((c) => c.entityId === ELOWEN);
    expect(elowen?.turn.bonusActionUsed).toBe(false);
  });
});

describe('what she holds', () => {
  it('an attack rests on it: the knife put in her other hand before the fight stays there', async () => {
    const world = await roadWorld();
    const knife = await give(world, 'hunting-knife');
    const equipped = await world.dm({
      type: 'EquipItem',
      characterId: ELOWEN,
      itemId: knife,
      slot: 'offhand',
    });
    expect(codeOf(equipped)).toBe('accepted');
    await startAmbush(world, undefined, raiderAt(3, 6));
    await reshape(world, fighter(['longsword']));
    world.roll(20, 15);
    world.roll(8, 4);
    // One hand on the sword: the knife fills the other.
    const swung = await world.submit(attack('longsword'));
    expect(await performed(world, swung)).not.toHaveProperty('grip');
    const undo = await world.dm({ type: 'UndoCommand', targetCommandId: equipped.commandId });
    expect(codeOf(undo)).toBe('UNDO_UNSAFE');
  });
});
