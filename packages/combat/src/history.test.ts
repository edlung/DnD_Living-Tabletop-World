import type { CommandResult } from '@ltw/contracts';
import { checkWorldIntegrity, redecideEffective, replay } from '@ltw/domain';
import { describe, expect, it } from 'vitest';

import { createCombatEngine } from './engine.ts';
import {
  AMBUSH,
  CAMPAIGN,
  ELOWEN,
  RAIDER_1,
  RAIDER_2,
  RAIDER_3,
  SHAMAN,
  codeOf,
  roadWorld,
  startAmbush,
  type RoadWorld,
} from './testing/road.ts';

/**
 * Combat history (ADR 0015, technical notes): recorded entropy makes every
 * decision replayable and re-decidable; undo unwinds strictly in reverse.
 */
const idOf = (result: CommandResult) => {
  if (result.commandId === null) throw new Error('no command ID');
  return result.commandId;
};
const undo = (world: RoadWorld, result: CommandResult) =>
  world.dm({ type: 'UndoCommand', targetCommandId: idOf(result) });

async function verify(world: RoadWorld) {
  const state = await world.state();
  const history = (await world.store.loadStream(CAMPAIGN))?.events ?? [];
  expect(replay(history)).toEqual(state);
  expect(checkWorldIntegrity(state)).toEqual([]);
  expect(
    redecideEffective(
      await world.engine.commandLog(CAMPAIGN),
      { state, history },
      () => 0,
      createCombatEngine(),
    ),
  ).toBeNull();
}

async function fight(world: RoadWorld) {
  const start = await startAmbush(world);
  const mark = await world.submit({
    type: 'CastSpell',
    combatantId: ELOWEN,
    spellId: 'hunters-mark',
    targetId: RAIDER_1,
  });
  world.roll(20, 18);
  const shot = await world.submit({
    type: 'Attack',
    combatantId: ELOWEN,
    attackId: 'longbow',
    targetId: RAIDER_2,
  });
  const moved = await world.submit({
    type: 'MoveCombatant',
    combatantId: ELOWEN,
    path: [{ x: 2, y: 7 }],
  });
  const ended = await world.submit({ type: 'EndTurn', combatantId: ELOWEN });
  world.roll(20, 19);
  const bolt = await world.dm({
    type: 'CastSpell',
    combatantId: SHAMAN,
    spellId: 'ashen-bolt',
    targetId: ELOWEN,
  });
  const turns = [];
  for (const id of [SHAMAN, RAIDER_1, RAIDER_2, RAIDER_3]) {
    turns.push(await world.dm({ type: 'EndTurn', combatantId: id }));
  }
  const fireball = await world.submit({
    type: 'CastSpell',
    combatantId: ELOWEN,
    spellId: 'fireball',
    point: { x: 10, y: 6 },
  });
  const steps = [start, mark, shot, moved, ended, bolt, ...turns, fireball];
  expect(steps.map(codeOf)).toEqual(Array(steps.length).fill('accepted'));
  return steps;
}

describe('combat history', () => {
  it('replays to the same state and re-decides every command identically', async () => {
    const world = await roadWorld();
    await fight(world);
    await verify(world);
  });

  it('undoes only the latest combat command, in reverse order, back to before the fight', async () => {
    const world = await roadWorld();
    const before = await world.state();
    const steps = await fight(world);
    const [start, mark] = steps;
    if (!start || !mark) throw new Error('missing steps');
    expect(codeOf(await undo(world, mark))).toBe('UNDO_UNSAFE');
    expect(codeOf(await undo(world, start))).toBe('UNDO_UNSAFE');
    for (const step of [...steps].reverse()) {
      expect(codeOf(await undo(world, step))).toBe('accepted');
    }
    const after = await world.state();
    expect(after.encounter).toBeNull();
    for (const id of [ELOWEN, RAIDER_1, RAIDER_2, SHAMAN]) {
      expect(after.entities.get(id)?.status).toBe(before.entities.get(id)?.status);
      expect(after.statBlocks.get(id)).toEqual(before.statBlocks.get(id));
    }
    expect(after.characterSheets.get(ELOWEN)).toEqual(before.characterSheets.get(ELOWEN));
    await verify(world);
  });

  it('allows a new encounter after the last one is undone or ended', async () => {
    const world = await roadWorld();
    const start = await startAmbush(world);
    await undo(world, start);
    world.roll(20, 1, 1, 1, 1, 1);
    const again = await world.dm(AMBUSH.startCombat);
    expect(codeOf(again)).toBe('accepted');
    await verify(world);
  });
});
