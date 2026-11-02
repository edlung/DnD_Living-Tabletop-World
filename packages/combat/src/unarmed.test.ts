import type { CharacterSheet } from '@ltw/contracts';
import { describe, expect, it } from 'vitest';

import {
  ELOWEN,
  PLAYER,
  RAIDER_1,
  SHAMAN,
  codeOf,
  recorded,
  roadWorld,
  startAmbush,
  type RoadWorld,
} from './testing/road.ts';
import { verifyHistory } from './testing/verify.ts';

/**
 * Unarmed Strike's grapple and shove, the escape, letting go, dragging, the grapple read as each
 * turn starts, and the object at hand (docs/adr/0047-weapons.md §3, §6). Elowen at (2, 6), remade a
 * fighter of level 5: Strength 16, +3 proficiency, a grapple's DC 14. Raider 1 beside her at
 * (3, 6): Strength save −1, Dexterity save +2 (it resists with Dexterity), Athletics −1,
 * Acrobatics +2.
 */
async function ready(): Promise<RoadWorld> {
  const world = await roadWorld();
  await startAmbush(world, undefined, (command) => ({
    ...command,
    combatants: command.combatants.map((c) =>
      c.entityId === RAIDER_1 ? { ...c, position: { x: 3, y: 6 } } : c,
    ),
  }));
  const sheet = (await world.state()).characterSheets.get(ELOWEN);
  if (!sheet) throw new Error('no sheet');
  const fighter: CharacterSheet = {
    ...sheet,
    classes: [{ classId: 'fighter', level: 5 }],
    abilities: { ...sheet.abilities, str: 16, dex: 14 },
    attacksPerAction: 2,
  };
  expect(
    codeOf(await world.dm({ type: 'SetCharacterSheet', entityId: ELOWEN, sheet: fighter })),
  ).toBe('accepted');
  return world;
}

const strike = (more: Record<string, unknown>) => ({
  type: 'Attack',
  combatantId: ELOWEN,
  attackId: 'unarmed-strike',
  targetId: RAIDER_1,
  ...more,
});
const reasonOf = (result: Awaited<ReturnType<RoadWorld['submit']>>) =>
  result.status === 'rejected' ? result.message : result.status;
const record = async (world: RoadWorld, id: string) =>
  (await world.encounter()).combatants.find((c) => c.entityId === id);
const conditions = async (world: RoadWorld, id = RAIDER_1) =>
  (await world.state()).statBlocks.get(id)?.conditions ?? [];

describe('a grapple', () => {
  it('holds a creature that fails its save: Speed 0, the grappler named', async () => {
    const world = await ready();
    world.roll(20, 5);
    const grabbed = await world.submit(strike({ unarmed: 'grapple' }));
    expect(grabbed.status === 'accepted' && grabbed.outcome).toEqual({
      kind: 'UnarmedStrike',
      effect: 'grapple',
      saved: false,
    });
    const save = (await recorded(world, grabbed)).find((e) => e.type === 'SavingThrowRolled');
    expect(save?.payload).toMatchObject({ ability: 'dex', dc: 14, purpose: 'grapple', total: 7 });
    expect(await conditions(world)).toContain('grappled');
    expect((await record(world, RAIDER_1))?.conditionDetails).toEqual([
      { condition: 'grappled', sourceId: ELOWEN },
    ]);
    expect((await record(world, ELOWEN))?.turn.attacksRemaining).toBe(1);
    expect(reasonOf(await world.submit(strike({ unarmed: 'grapple' })))).toBe('ALREADY_GRAPPLED');
    await verifyHistory(world);
  });

  it('fails on a creature that saves', async () => {
    const world = await ready();
    world.roll(20, 15);
    const missed = await world.submit(strike({ unarmed: 'grapple' }));
    expect(missed.status === 'accepted' && missed.outcome).toMatchObject({ saved: true });
    expect(await conditions(world)).not.toContain('grappled');
  });

  it('the grappled creature escapes with its action, by the grapple’s DC', async () => {
    const world = await ready();
    world.roll(20, 5);
    await world.submit(strike({ unarmed: 'grapple' }));
    await world.submit({ type: 'EndTurn', combatantId: ELOWEN }, PLAYER);
    await world.dm({ type: 'EndTurn', combatantId: SHAMAN });
    world.roll(20, 15);
    const escaped = await world.dm({
      type: 'TakeAction',
      combatantId: RAIDER_1,
      action: 'escape',
      skill: 'acrobatics',
    });
    const taken = (await recorded(world, escaped)).find((e) => e.type === 'ActionTaken');
    expect(taken?.payload).toMatchObject({
      action: 'escape',
      check: { skill: 'acrobatics', total: 17, success: true },
    });
    expect(await conditions(world)).not.toContain('grappled');
    expect((await record(world, RAIDER_1))?.conditionDetails).toBeUndefined();
    await verifyHistory(world);
  });

  it('is let go at will, the action spent or not', async () => {
    const world = await ready();
    world.roll(20, 5);
    await world.submit(strike({ unarmed: 'grapple' }));
    // Her action began with the grapple; letting go takes none.
    const released = await world.submit({
      type: 'TakeAction',
      combatantId: ELOWEN,
      action: 'release',
    });
    expect(codeOf(released)).toBe('accepted');
    expect(await conditions(world)).not.toContain('grappled');
    expect(
      reasonOf(await world.submit({ type: 'TakeAction', combatantId: ELOWEN, action: 'release' })),
    ).toBe('NOT_GRAPPLING');
  });

  it('drags the creature along, each foot costing another', async () => {
    const world = await ready();
    world.roll(20, 5);
    await world.submit(strike({ unarmed: 'grapple' }));
    const moved = await world.submit({
      type: 'MoveCombatant',
      combatantId: ELOWEN,
      path: [{ x: 1, y: 6 }],
    });
    expect(codeOf(moved)).toBe('accepted');
    expect((await record(world, ELOWEN))?.turn.movementUsedFt).toBe(10);
    expect((await record(world, RAIDER_1))?.position).toEqual({ x: 2, y: 6 });
    // 30 ft of Speed, 10 spent: 15 more feet of dragging would take 30.
    expect(
      reasonOf(
        await world.submit({
          type: 'MoveCombatant',
          combatantId: ELOWEN,
          path: [
            { x: 0, y: 6 },
            { x: 0, y: 5 },
            { x: 0, y: 4 },
          ],
        }),
      ),
    ).toBe('NOT_ENOUGH_MOVEMENT');
    await verifyHistory(world);
  });

  it('ends as a turn starts when its grappler can no longer hold it', async () => {
    const world = await ready();
    world.roll(20, 5);
    await world.submit(strike({ unarmed: 'grapple' }));
    await world.dm({
      type: 'SetCondition',
      targetId: ELOWEN,
      condition: 'stunned',
      applied: true,
      reason: 'A test',
    });
    await world.submit({ type: 'EndTurn', combatantId: ELOWEN }, PLAYER);
    expect(await conditions(world)).not.toContain('grappled');
  });
});

describe('a shove and an object at hand', () => {
  it('a shove pushes 5 ft away, or knocks it Prone', async () => {
    const world = await ready();
    world.roll(20, 5);
    const pushed = await world.submit(strike({ unarmed: 'shove' }));
    expect(pushed.status === 'accepted' && pushed.outcome).toEqual({
      kind: 'UnarmedStrike',
      effect: 'shove',
      saved: false,
      shove: 'push',
    });
    expect((await record(world, RAIDER_1))?.position).toEqual({ x: 4, y: 6 });

    const down = await ready();
    down.roll(20, 5);
    await down.submit(strike({ unarmed: 'shove', shove: 'prone' }));
    expect(await conditions(down)).toContain('prone');
  });

  it('an object at hand strikes without proficiency for 1d4, or is thrown 20/60', async () => {
    const world = await ready();
    world.roll(20, 10);
    world.roll(4, 2);
    const hit = await world.submit(strike({ attackId: 'improvised' }));
    const roll = (await recorded(world, hit)).find((e) => e.type === 'AttackPerformed');
    // Strength +3 and no proficiency: 13 misses AC 15, where her sword's +6 would hit.
    expect(roll?.payload).toMatchObject({ modifier: 3, total: 13, hit: false });
    world.roll(20, 14);
    world.roll(4, 2);
    await world.submit(strike({ attackId: 'improvised' }));
    expect((await world.state()).statBlocks.get(RAIDER_1)?.hitPoints.current).toBe(10 - 5);
  });
});
