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
 * Mounted combat (SRD 5.2.1; docs/adr/0049-space-and-movement.md §10) on the Old Trade Road: a
 * Large grey worg on the party's side fills (3, 6)–(4, 7) beside Elowen at (2, 6), at initiative
 * 12, after the Shaman; Elowen (Speed 30) commands it unless a test says otherwise.
 */
const WORG = 'creature-77c0f1a2';

async function withWorg({ commanded = true } = {}): Promise<RoadWorld> {
  const world = await roadWorld();
  await startAmbush(world);
  const block = (await world.state()).statBlocks.get(RAIDER_1);
  if (!block) throw new Error('no block');
  await world.dm({
    type: 'CreateEntity',
    entityId: WORG,
    kind: 'creature',
    name: 'Grey Worg',
    existsSince: null,
    placement: { locationId: 'old-trade-road', since: null },
  });
  await world.dm({ type: 'SetStatBlock', entityId: WORG, statBlock: { ...block, size: 'large' } });
  const added = await world.dm({
    type: 'AddCombatant',
    entityId: WORG,
    side: 'party',
    position: { x: 3, y: 6 },
    initiative: 12,
  });
  expect(codeOf(added)).toBe('accepted');
  if (commanded) {
    await world.dm({ type: 'CommandCreature', combatantId: WORG, characterId: ELOWEN });
  }
  return world;
}

const record = async (world: RoadWorld, id: string) => {
  const found = (await world.encounter()).combatants.find((c) => c.entityId === id);
  if (!found) throw new Error('no combatant');
  return found;
};
const mount = (world: RoadWorld) =>
  world.submit(
    { type: 'TakeAction', combatantId: ELOWEN, action: 'mount', targetId: WORG },
    PLAYER,
  );
const reasonOf = (result: Awaited<ReturnType<RoadWorld['submit']>>) =>
  result.status === 'rejected' ? result.message : result.status;
const prone = (world: RoadWorld, targetId: string) =>
  world.dm({
    type: 'SetCondition',
    targetId,
    condition: 'prone',
    applied: true,
    reason: 'A test of the rules',
  });
const conditionsOf = async (world: RoadWorld) =>
  (await world.state()).characterSheets.get(ELOWEN)?.conditions ?? [];

describe('mounting and getting down', () => {
  it('she mounts the worg beside her for half her Speed, sharing its space', async () => {
    const world = await withWorg();
    const mounted = await mount(world);
    expect(codeOf(mounted)).toBe('accepted');
    expect(await record(world, ELOWEN)).toMatchObject({
      mountedOn: WORG,
      position: { x: 3, y: 6 },
      turn: { movementUsedFt: 15, mounting: true },
    });
    // Her worg, which she commands, acts right after her.
    const order = (await world.encounter()).combatants.map((c) => c.entityId);
    expect(order.slice(0, 2)).toEqual([ELOWEN, WORG]);
    // Once a move, and never on foot while she rides.
    const again = await world.submit(
      { type: 'TakeAction', combatantId: ELOWEN, action: 'dismount' },
      PLAYER,
    );
    expect(reasonOf(again)).toBe('MOUNTED_THIS_TURN');
    const walked = await world.submit(
      { type: 'MoveCombatant', combatantId: ELOWEN, path: [{ x: 2, y: 5 }] },
      PLAYER,
    );
    expect(reasonOf(walked)).toBe('MOUNTED');
    await verifyHistory(world);
  });

  it('refuses a creature not a size larger, and one not on her side', async () => {
    const world = await roadWorld();
    await startAmbush(world, undefined, (command) => ({
      ...command,
      combatants: command.combatants.map((c) =>
        c.entityId === RAIDER_1 ? { ...c, position: { x: 3, y: 6 } } : c,
      ),
    }));
    const refused = await world.submit(
      { type: 'TakeAction', combatantId: ELOWEN, action: 'mount', targetId: RAIDER_1 },
      PLAYER,
    );
    expect(reasonOf(refused)).toBe('NOT_WILLING');
  });

  it('the worg carries her on its turn, and dashes but does not attack', async () => {
    const world = await withWorg();
    await mount(world);
    await world.submit({ type: 'EndTurn', combatantId: ELOWEN }, PLAYER);
    // The worg's turn: her player runs it.
    const attacked = await world.submit(
      { type: 'Attack', combatantId: WORG, attackId: 'scimitar', targetId: SHAMAN },
      PLAYER,
    );
    expect(reasonOf(attacked)).toBe('CONTROLLED_MOUNT');
    expect(
      codeOf(await world.submit({ type: 'TakeAction', combatantId: WORG, action: 'dash' }, PLAYER)),
    ).toBe('accepted');
    const ran = await world.submit(
      {
        type: 'MoveCombatant',
        combatantId: WORG,
        path: [
          { x: 4, y: 5 },
          { x: 5, y: 5 },
        ],
      },
      PLAYER,
    );
    expect(codeOf(ran)).toBe('accepted');
    expect((await record(world, ELOWEN)).position).toEqual({ x: 5, y: 5 });
    await verifyHistory(world);
  });
});

describe('getting down', () => {
  it('on her next turn she gets down beside the worg, for half her Speed', async () => {
    const world = await withWorg();
    await mount(world);
    // Round the table to her turn again: she and her worg end theirs, the DM the rest.
    for (let turns = 0; turns < 12; turns += 1) {
      const encounter = await world.encounter();
      const current = encounter.combatants[encounter.currentIndex]?.entityId;
      if (turns > 0 && current === ELOWEN) break;
      const end = { type: 'EndTurn', combatantId: current };
      if (current === ELOWEN || current === WORG) await world.submit(end, PLAYER);
      else await world.dm(end);
    }
    const down = await world.submit(
      { type: 'TakeAction', combatantId: ELOWEN, action: 'dismount', square: { x: 2, y: 6 } },
      PLAYER,
    );
    expect(codeOf(down)).toBe('accepted');
    const elowen = await record(world, ELOWEN);
    expect(elowen.mountedOn).toBeUndefined();
    expect(elowen.position).toEqual({ x: 2, y: 6 });
    expect(elowen.turn.movementUsedFt).toBe(15);
    // Inside the worg's space is no place to land.
    const back = await withWorg();
    await mount(back);
    expect(
      reasonOf(
        await back.submit(
          { type: 'TakeAction', combatantId: ELOWEN, action: 'dismount', square: { x: 4, y: 7 } },
          PLAYER,
        ),
      ),
    ).toBe('MOUNTED_THIS_TURN');
    await verifyHistory(world);
  });
});

describe('falling out of the saddle', () => {
  it('a worg knocked Prone throws her: on her feet, her Reaction spent', async () => {
    const world = await withWorg();
    await mount(world);
    expect(codeOf(await prone(world, WORG))).toBe('accepted');
    const elowen = await record(world, ELOWEN);
    expect(elowen.mountedOn).toBeUndefined();
    expect(elowen.turn.reactionAvailable).toBe(false);
    expect(await conditionsOf(world)).not.toContain('prone');
    await verifyHistory(world);
  });

  it('knocked Prone in the saddle, she keeps her seat on a 10 or more', async () => {
    const world = await withWorg();
    await mount(world);
    world.roll(20, 15);
    const kept = await prone(world, ELOWEN);
    const save = (await recorded(world, kept)).find((e) => e.type === 'SavingThrowRolled');
    expect(save?.payload).toMatchObject({ purpose: 'saddle', dc: 10, success: true });
    expect((await record(world, ELOWEN)).mountedOn).toBe(WORG);
    expect(await conditionsOf(world)).not.toContain('prone');
  });

  it('and falls off Prone beside the worg on a failure', async () => {
    const world = await withWorg();
    await mount(world);
    // Clumsy for once: Dexterity 8, no proficiency in its saves (+9 never fails DC 10).
    const sheet = (await world.state()).characterSheets.get(ELOWEN);
    if (!sheet) throw new Error('no sheet');
    await world.dm({
      type: 'SetCharacterSheet',
      entityId: ELOWEN,
      sheet: { ...sheet, abilities: { ...sheet.abilities, dex: 8 }, savingThrows: ['str'] },
    });
    world.roll(20, 2);
    await prone(world, ELOWEN);
    const elowen = await record(world, ELOWEN);
    expect(elowen.mountedOn).toBeUndefined();
    expect(elowen.position).not.toEqual({ x: 3, y: 6 });
    expect(await conditionsOf(world)).toContain('prone');
    await verifyHistory(world);
  });
});

describe('an independent mount', () => {
  it('keeps its own place in the order', async () => {
    const world = await withWorg({ commanded: false });
    const before = (await world.encounter()).combatants.map((c) => c.entityId);
    expect(codeOf(await mount(world))).toBe('accepted');
    expect((await world.encounter()).combatants.map((c) => c.entityId)).toEqual(before);
  });
});
