import type { CharacterSheet, WeaponId } from '@ltw/contracts';
import { describe, expect, it } from 'vitest';

import {
  ELOWEN,
  PLAYER,
  RAIDER_1,
  RAIDER_2,
  SHAMAN,
  codeOf,
  recorded,
  roadWorld,
  startAmbush,
  type RoadWorld,
} from './testing/road.ts';
import { verifyHistory } from './testing/verify.ts';

/**
 * The weapon masteries (docs/adr/0047-weapons.md §2), through the World Engine. Elowen at (2, 6),
 * remade as a fighter of level 5 (Strength 16, +3 proficiency, three masteries: her sheet's
 * weapons); Raider 1 beside her at (3, 6), AC 15, 10 HP, Constitution save +0.
 */
type Placed = { combatants: { entityId: string }[] } & Record<string, unknown>;
const placing =
  (places: Readonly<Record<string, { x: number; y: number }>>) =>
  (command: Placed): Placed => ({
    ...command,
    combatants: command.combatants.map((c) =>
      places[c.entityId] ? { ...c, position: places[c.entityId] } : c,
    ),
  });

async function armed(
  weapons: WeaponId[],
  changes: Partial<CharacterSheet> = {},
  places: Readonly<Record<string, { x: number; y: number }>> = { [RAIDER_1]: { x: 3, y: 6 } },
): Promise<RoadWorld> {
  const world = await roadWorld();
  await startAmbush(world, undefined, placing(places));
  const sheet = (await world.state()).characterSheets.get(ELOWEN);
  if (!sheet) throw new Error('no sheet');
  const set = await world.dm({
    type: 'SetCharacterSheet',
    entityId: ELOWEN,
    sheet: {
      ...sheet,
      classes: [{ classId: 'fighter', level: 5 }],
      abilities: { ...sheet.abilities, str: 16, dex: 14 },
      attacksPerAction: 2,
      weapons,
      ...changes,
    },
  });
  expect(codeOf(set)).toBe('accepted');
  return world;
}

const attack = (attackId: string, targetId = RAIDER_1, more: Record<string, unknown> = {}) => ({
  type: 'Attack',
  combatantId: ELOWEN,
  attackId,
  targetId,
  ...more,
});
const reasonOf = (result: Awaited<ReturnType<RoadWorld['submit']>>) =>
  result.status === 'rejected' ? result.message : result.status;
const record = async (world: RoadWorld, id: string) =>
  (await world.encounter()).combatants.find((c) => c.entityId === id);
const masteries = async (world: RoadWorld, result: Awaited<ReturnType<RoadWorld['submit']>>) =>
  (await recorded(world, result))
    .filter((event) => event.type === 'WeaponMasteryApplied')
    .map((event) => event.payload);
const hp = async (world: RoadWorld, id = RAIDER_1) =>
  (await world.state()).statBlocks.get(id)?.hitPoints.current;

describe('Sap and Vex', () => {
  it('Sap: the creature it hits has Disadvantage on its next attack', async () => {
    const world = await armed(['mace']);
    world.roll(20, 15);
    world.roll(6, 1);
    const hit = await world.submit(attack('mace'));
    expect(await masteries(world, hit)).toEqual([
      { attackerId: ELOWEN, targetId: RAIDER_1, mastery: 'sap' },
    ]);
    expect((await record(world, RAIDER_1))?.sappedBy).toBe(ELOWEN);
    await world.submit({ type: 'EndTurn', combatantId: ELOWEN }, PLAYER);
    await world.dm({ type: 'EndTurn', combatantId: SHAMAN });
    world.roll(20, 15, 2);
    const answered = await world.dm({
      type: 'Attack',
      combatantId: RAIDER_1,
      attackId: 'scimitar',
      targetId: ELOWEN,
    });
    const roll = (await recorded(world, answered)).find((e) => e.type === 'AttackPerformed');
    expect(roll?.payload).toMatchObject({ disadvantage: true, hit: false });
    expect((await record(world, RAIDER_1))?.sappedBy).toBeUndefined();
    await verifyHistory(world);
  });

  it('Vex: a hit that deals damage gives her Advantage on her next attack against it', async () => {
    const world = await armed(['shortsword']);
    world.roll(20, 15);
    world.roll(6, 1);
    await world.submit(attack('shortsword'));
    expect((await record(world, ELOWEN))?.vexing).toEqual({ targetId: RAIDER_1, turnsLeft: 2 });
    world.roll(20, 3, 15);
    world.roll(6, 1);
    const again = await world.submit(attack('shortsword'));
    const roll = (await recorded(world, again)).find((e) => e.type === 'AttackPerformed');
    expect(roll?.payload).toMatchObject({ advantage: true, hit: true });
    // Used, and given again by that hit.
    expect((await record(world, ELOWEN))?.vexing).toEqual({ targetId: RAIDER_1, turnsLeft: 2 });
    await world.submit({ type: 'EndTurn', combatantId: ELOWEN }, PLAYER);
    expect((await record(world, ELOWEN))?.vexing).toEqual({ targetId: RAIDER_1, turnsLeft: 1 });
  });

  it('a weapon not mastered keeps its mastery to itself', async () => {
    const world = await armed(['mace'], { classes: [{ classId: 'cleric', level: 5 }] });
    world.roll(20, 15);
    world.roll(6, 1);
    const hit = await world.submit(attack('mace'));
    expect(await masteries(world, hit)).toEqual([]);
    expect((await record(world, RAIDER_1))?.sappedBy).toBeUndefined();
  });
});

describe('Topple and Push', () => {
  it('Topple: a failed Constitution save leaves it Prone', async () => {
    const world = await armed(['battleaxe']);
    world.roll(20, 15);
    world.roll(10, 1);
    world.roll(20, 5);
    const hit = await world.submit(attack('battleaxe'));
    const save = (await recorded(world, hit)).find((e) => e.type === 'SavingThrowRolled');
    // DC 8 + Strength 3 + proficiency 3.
    expect(save?.payload).toMatchObject({ dc: 14, success: false, purpose: 'topple' });
    expect((await world.state()).statBlocks.get(RAIDER_1)?.conditions).toContain('prone');
    expect(await hp(world)).toBe(10 - 4);
  });

  it('Topple is the attacker’s choice', async () => {
    const world = await armed(['battleaxe']);
    world.roll(20, 15);
    world.roll(10, 1);
    const hit = await world.submit(attack('battleaxe', RAIDER_1, { topple: false }));
    expect(await masteries(world, hit)).toEqual([]);
  });

  it('Push: 10 ft straight away, or less, and no farther than the next creature', async () => {
    const world = await armed(['warhammer']);
    world.roll(20, 15);
    world.roll(10, 1);
    const hit = await world.submit(attack('warhammer'));
    expect(await masteries(world, hit)).toEqual([
      {
        attackerId: ELOWEN,
        targetId: RAIDER_1,
        mastery: 'push',
        from: { x: 3, y: 6 },
        to: { x: 5, y: 6 },
      },
    ]);
    expect((await record(world, RAIDER_1))?.position).toEqual({ x: 5, y: 6 });

    const blocked = await armed(
      ['warhammer'],
      {},
      {
        [RAIDER_1]: { x: 3, y: 6 },
        [RAIDER_2]: { x: 5, y: 6 },
      },
    );
    blocked.roll(20, 15);
    blocked.roll(10, 1);
    await blocked.submit(attack('warhammer'));
    expect((await record(blocked, RAIDER_1))?.position).toEqual({ x: 4, y: 6 });

    const held = await armed(['warhammer']);
    held.roll(20, 15);
    held.roll(10, 1);
    await held.submit(attack('warhammer', RAIDER_1, { push: 0 }));
    expect((await record(held, RAIDER_1))?.position).toEqual({ x: 3, y: 6 });
    await verifyHistory(world);
  });
});

describe('Graze and Cleave', () => {
  it('Graze: a miss still deals her Strength modifier', async () => {
    const world = await armed(['greatsword']);
    world.roll(20, 2);
    const missed = await world.submit(attack('greatsword'));
    const events = await recorded(world, missed);
    expect(events.find((e) => e.type === 'AttackPerformed')?.payload).toMatchObject({ hit: false });
    expect(events.find((e) => e.type === 'DamageApplied')?.payload).toMatchObject({
      amount: 3,
      rolls: [],
      damageType: 'slashing',
    });
    expect(await hp(world)).toBe(10 - 3);
  });

  it('Cleave: a second attack at a creature beside the first, once a turn, no modifier', async () => {
    const world = await armed(
      ['greataxe'],
      {},
      {
        [RAIDER_1]: { x: 3, y: 6 },
        [RAIDER_2]: { x: 3, y: 7 },
      },
    );
    world.roll(20, 15);
    world.roll(12, 2);
    await world.submit(attack('greataxe'));
    expect((await record(world, ELOWEN))?.turn.cleave).toMatchObject({
      targetId: RAIDER_1,
      attackId: 'greataxe',
    });
    expect(reasonOf(await world.submit(attack('greataxe', RAIDER_1, { extra: 'cleave' })))).toBe(
      'NO_EXTRA_ATTACK',
    );
    world.roll(20, 15);
    world.roll(12, 4);
    const second = await world.submit(attack('greataxe', RAIDER_2, { extra: 'cleave' }));
    expect(codeOf(second)).toBe('accepted');
    expect(await hp(world, RAIDER_2)).toBe(10 - 4);
    const elowen = await record(world, ELOWEN);
    expect(elowen?.turn).toMatchObject({ cleaved: true, attacksRemaining: 1 });
    expect(elowen?.turn.cleave).toBeUndefined();
    // Her second attack hits again; Cleave is spent for this turn.
    world.roll(20, 15);
    world.roll(12, 1);
    await world.submit(attack('greataxe'));
    expect((await record(world, ELOWEN))?.turn.cleave).toBeUndefined();
    await verifyHistory(world);
  });
});
