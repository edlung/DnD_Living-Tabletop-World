import type { CommandResult } from '@ltw/contracts';
import { possessionOf } from '@ltw/domain';
import { describe, expect, it } from 'vitest';

import {
  ELOWEN,
  RAIDER_1,
  codeOf,
  roadWorld,
  startAmbush,
  type RoadWorld,
} from './testing/road.ts';

/** Item actions in a fight (docs/adr/0039-item-possession.md, Stage 490): turn economy and limits. */
const reason = (result: CommandResult) =>
  result.status === 'rejected' ? result.message : result.status;

async function packWorld(): Promise<RoadWorld> {
  const world = await roadWorld();
  const sheet = (await world.state()).characterSheets.get(ELOWEN);
  if (!sheet) throw new Error('no sheet');
  const gear = [
    ['gear-balm', 'woodland-balm', 2],
    ['gear-ale', 'inn-ale', 1],
    ['gear-buckler', 'oak-buckler', 1],
    ['gear-mail', 'watchman-mail', 1],
    ['gear-cloak', 'caravan-cloak', 1],
    ['gear-letter', undefined, 1],
  ] as const;
  for (const [id, catalogId, quantity] of gear) {
    await world.dm({
      type: 'CreateEntity',
      entityId: id,
      kind: 'item',
      name: id,
      existsSince: null,
    });
    await world.dm({
      type: 'GrantItem',
      itemId: id,
      holderId: ELOWEN,
      ...(catalogId ? { catalogId } : {}),
      quantity,
    });
  }
  await world.dm({
    type: 'SetCharacterSheet',
    entityId: ELOWEN,
    sheet: { ...sheet, hitPoints: { ...sheet.hitPoints, current: 40 } },
  });
  await startAmbush(world);
  return world;
}
const act = (world: RoadWorld, command: Record<string, unknown>) =>
  world.submit({ characterId: ELOWEN, ...command });

describe('items during an encounter', () => {
  it('a potion is a Bonus Action: it heals once a turn, and the turn ends the limit', async () => {
    const world = await packWorld();
    expect(codeOf(await act(world, { type: 'UseItem', itemId: 'gear-balm' }))).toBe('accepted');
    const state = await world.state();
    expect(state.characterSheets.get(ELOWEN)?.hitPoints.current).toBe(47);
    expect(state.encounter?.combatants[0]?.turn.bonusActionUsed).toBe(true);
    expect(reason(await act(world, { type: 'UseItem', itemId: 'gear-balm' }))).toBe(
      'NO_BONUS_ACTION',
    );
    expect(possessionOf(state, 'gear-balm')?.quantity).toBe(1);
  });

  it('a shield or a mundane use is an Action, and both Actions cannot be had', async () => {
    const world = await packWorld();
    expect(
      codeOf(await act(world, { type: 'EquipItem', itemId: 'gear-buckler', slot: 'offhand' })),
    ).toBe('accepted');
    expect((await world.encounter()).combatants[0]?.turn.actionUsed).toBe(true);
    expect(reason(await act(world, { type: 'UseItem', itemId: 'gear-ale' }))).toBe('NO_ACTION');
    // A Bonus Action is still there.
    expect(
      codeOf(await act(world, { type: 'EquipItem', itemId: 'gear-cloak', slot: 'cloak' })),
    ).toBe('accepted');
  });

  it('refuses body armor, picking up, and acting out of turn', async () => {
    const world = await packWorld();
    expect(codeOf(await act(world, { type: 'EquipItem', itemId: 'gear-mail', slot: 'body' }))).toBe(
      'INVALID_ITEM',
    );
    expect(codeOf(await act(world, { type: 'TakeItem', itemId: 'gear-letter' }))).toBe(
      'COMBAT_ALREADY_ACTIVE',
    );
    await world.dm({ type: 'EndTurn', combatantId: ELOWEN });
    expect(reason(await act(world, { type: 'UseItem', itemId: 'gear-balm' }))).toBe(
      'NOT_YOUR_TURN',
    );
  });

  it('dropping is free; handing over needs someone beside you', async () => {
    const world = await packWorld();
    expect(codeOf(await act(world, { type: 'DropItem', itemId: 'gear-letter' }))).toBe('accepted');
    expect((await world.encounter()).combatants[0]?.turn).toMatchObject({
      actionUsed: false,
      bonusActionUsed: false,
    });
    // A raider is no one to hand things to (a creature carries nothing).
    expect(
      codeOf(await act(world, { type: 'GiveItem', itemId: 'gear-ale', toHolderId: RAIDER_1 })),
    ).toBe('INVALID_ITEM');
  });

  it('undoing a use restores the item, the sheet and the turn together', async () => {
    const world = await packWorld();
    const used = await act(world, { type: 'UseItem', itemId: 'gear-balm' });
    if (used.status !== 'accepted') throw new Error('use refused');
    const undone = await world.dm({ type: 'UndoCommand', targetCommandId: used.commandId });
    expect(codeOf(undone)).toBe('accepted');
    const state = await world.state();
    expect(state.characterSheets.get(ELOWEN)?.hitPoints.current).toBe(40);
    expect(possessionOf(state, 'gear-balm')?.quantity).toBe(2);
    expect(state.encounter?.combatants[0]?.turn.bonusActionUsed).toBe(false);
  });

  it('gives a fresh economy next turn', async () => {
    const world = await packWorld();
    await act(world, { type: 'UseItem', itemId: 'gear-balm' });
    for (let turns = 0; turns < 5; turns += 1) {
      const current = (await world.encounter()).combatants[(await world.encounter()).currentIndex];
      await world.dm({ type: 'EndTurn', combatantId: current?.entityId });
      if (
        (await world.encounter()).combatants[(await world.encounter()).currentIndex]?.entityId ===
        ELOWEN
      )
        break;
    }
    expect(codeOf(await act(world, { type: 'UseItem', itemId: 'gear-balm' }))).toBe('accepted');
  });
});
