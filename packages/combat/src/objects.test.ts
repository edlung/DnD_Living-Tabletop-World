import type { CommandResult } from '@ltw/contracts';
import { describe, expect, it } from 'vitest';

import { spellSave } from './saves.ts';
import {
  AMBUSH,
  ELOWEN,
  PLAYER,
  SHAMAN,
  codeOf,
  recorded,
  roadWorld,
  startAmbush,
  type RoadWorld,
} from './testing/road.ts';
import { verifyHistory } from './testing/verify.ts';
import { hitPoints, vitalsOf } from './vitals.ts';

/**
 * Objects the party attacks (docs/adr/0048-hit-points.md §5): an overturned cart on the Old Trade
 * Road joins the fight beside Elowen, who stands at (9, 7) with a shortsword added to her sheet:
 * d20 + 9, 1d6 + 4 piercing.
 */
const CART = 'feature-a022d4a2';

async function fight(): Promise<RoadWorld> {
  const world = await roadWorld();
  const sheet = (await world.state()).characterSheets.get(ELOWEN);
  if (!sheet) throw new Error('no sheet');
  await world.dm({
    type: 'SetCharacterSheet',
    entityId: ELOWEN,
    sheet: { ...sheet, weapons: ['longbow', 'shortsword'] },
  });
  await world.dm({
    type: 'CreateEntity',
    entityId: CART,
    kind: 'feature',
    name: 'Overturned cart',
    existsSince: null,
  });
  await world.dm({ type: 'PlaceEntity', entityId: CART, locationId: 'old-trade-road' });
  await startAmbush(world, undefined, (command) => ({
    ...command,
    combatants: command.combatants.map((entry) =>
      entry.entityId === ELOWEN ? { ...entry, position: { x: 9, y: 7 } } : entry,
    ),
  }));
  return world;
}

const addCart = (world: RoadWorld, more: Record<string, unknown> = {}) =>
  world.dm({
    type: 'AddObject',
    entityId: CART,
    material: 'wood',
    size: 'large',
    resilient: false,
    position: { x: 9, y: 8 },
    ...more,
  });

const strike = (world: RoadWorld, face: number, more: Record<string, unknown> = {}) => {
  world.roll(20, 12);
  world.roll(6, face);
  return world.submit({
    type: 'Attack',
    combatantId: ELOWEN,
    attackId: 'shortsword',
    targetId: CART,
    ...more,
  });
};

const cart = async (world: RoadWorld) => {
  const vitals = vitalsOf(await world.state(), CART);
  if (!vitals) throw new Error('no cart');
  return vitals;
};
const reasonOf = (result: CommandResult) =>
  result.status === 'rejected' ? result.message : result.status;

describe('an object in a fight', () => {
  it('joins with its Armor Class and hit points from the tables, and takes no turn', async () => {
    const world = await fight();
    const added = await addCart(world);
    expect(codeOf(added)).toBe('accepted');
    const block = (await world.state()).statBlocks.get(CART);
    expect(block).toMatchObject({
      armorClass: 15,
      hitPoints: { max: 5, current: 5 },
      immunities: ['poison', 'psychic'],
      object: { material: 'wood', size: 'large', resilient: false },
    });
    // Elowen, then the Shaman, then the raiders — never the cart.
    const order = async () => (await world.encounter()).combatants.map((c) => c.entityId);
    expect((await order()).at(-1)).toBe(CART);
    await world.submit({ type: 'EndTurn', combatantId: ELOWEN }, PLAYER);
    for (let turn = 0; turn < 4; turn += 1) {
      const current = (await world.encounter()).combatants[(await world.encounter()).currentIndex]
        ?.entityId;
      expect(current).not.toBe(CART);
      if (current === undefined) throw new Error('no turn');
      await world.dm({ type: 'EndTurn', combatantId: current });
    }
    expect((await world.encounter()).round).toBe(2);
    await verifyHistory(world);
  });

  it('is struck like any target and destroyed at 0 hit points, where it stood', async () => {
    const world = await fight();
    await addCart(world);
    // 12 + 9 hits AC 15; 1 + 4 = 5 breaks the fragile cart.
    const blow = await strike(world, 1, { knockOut: true });
    expect(codeOf(blow)).toBe('accepted');
    const events = await recorded(world, blow);
    expect(events.find((e) => e.type === 'DamageApplied')?.payload).toMatchObject({
      amount: 5,
      hpAfter: 0,
    });
    // An object takes no weapon mastery: no Vex for her shortsword.
    expect(events.some((e) => e.type === 'WeaponMasteryApplied')).toBe(false);
    expect((await world.state()).entities.get(CART)?.status).toBe('destroyed');
    expect((await world.encounter()).combatants.some((c) => c.entityId === CART)).toBe(true);
    expect(reasonOf(await strike(world, 3))).toBe('TARGET_DEAD');
    await verifyHistory(world);
  });

  it('is immune to poison and psychic damage, and keeps its damage into the next fight', async () => {
    const world = await fight();
    await addCart(world, { resilient: true });
    const poison = await world.dm({
      type: 'AdjustHitPoints',
      targetId: CART,
      change: 'damage',
      amount: 9,
      damageType: 'poison',
      reason: 'A test of the rules',
    });
    expect(codeOf(poison)).toBe('accepted');
    expect(hitPoints(await cart(world)).current).toBe(27);
    await strike(world, 2);
    expect(hitPoints(await cart(world)).current).toBe(27 - 6);
    const encounterId = (await world.encounter()).encounterId;
    expect(codeOf(await world.dm({ type: 'EndCombat', encounterId }))).toBe('accepted');
    world.roll(20, 17, 3, 2, 1, 15);
    expect(codeOf(await world.dm(structuredClone(AMBUSH.startCombat)))).toBe('accepted');
    expect(codeOf(await addCart(world, { resilient: true, position: { x: 5, y: 8 } }))).toBe(
      'accepted',
    );
    expect(hitPoints(await cart(world)).current).toBe(21);
  });

  it('takes no condition, no grapple and no spell that names a creature, and fails every save', async () => {
    const world = await fight();
    await addCart(world);
    const held = await world.dm({
      type: 'SetCondition',
      targetId: CART,
      condition: 'prone',
      applied: true,
      reason: 'A test of the rules',
    });
    expect(codeOf(held)).toBe('NO_EFFECT');
    expect(
      reasonOf(
        await world.submit({
          type: 'Attack',
          combatantId: ELOWEN,
          attackId: 'unarmed-strike',
          targetId: CART,
          unarmed: 'grapple',
        }),
      ),
    ).toBe('NOT_A_CREATURE');
    const marked = await world.submit({
      type: 'CastSpell',
      combatantId: ELOWEN,
      spellId: 'hunters-mark',
      targetId: CART,
    });
    expect(reasonOf(marked)).toBe('NOT_A_CREATURE');
    const save = spellSave({ roll: () => 20 }, await cart(world), 'dex', 5, 'none');
    expect(save.success).toBe(false);
    expect(save.event.payload).toMatchObject({ rolls: [], success: false });
  });

  it('joins only as an object: never through AddCombatant, nor commanded, nor given initiative', async () => {
    const world = await fight();
    expect(
      reasonOf(
        await world.dm({
          type: 'AddObject',
          entityId: SHAMAN,
          material: 'wood',
          size: 'medium',
          resilient: true,
          position: { x: 0, y: 0 },
        }),
      ),
    ).toBe('An item or a feature of the place becomes an object');
    await addCart(world);
    expect(codeOf(await world.dm({ type: 'SetInitiative', combatantId: CART, total: 20 }))).toBe(
      'NO_EFFECT',
    );
    expect(
      codeOf(await world.dm({ type: 'CommandCreature', combatantId: CART, characterId: ELOWEN })),
    ).toBe('INVALID_COMMAND');
    expect(codeOf(await addCart(world))).toBe('INVALID_ENCOUNTER');
  });
});
