import type { BoardTrap, CommandResult } from '@ltw/contracts';
import { describe, expect, it } from 'vitest';

import { passivePerception } from './board-traps.ts';
import {
  ELOWEN,
  codeOf,
  recorded,
  roadWorld,
  startAmbush,
  type RoadWorld,
} from './testing/road.ts';
import { verifyHistory } from './testing/verify.ts';
import { vitalsOf } from './vitals.ts';

/**
 * Finding and disarming traps on the Old Trade Road (docs/adr/0057-encounters-maps-loot.md §6):
 * Elowen at (2, 6) acts first. A Search trap is noticed by her Passive Perception as she comes
 * within 5 feet, and she stops short of it; a Study trap never is. A Search's Perception or a
 * Study's Investigation at the DC finds one within 5 feet; Utilize disarms a trap she knows of.
 */
const at = (...squares: [number, number][]) => squares.map(([x, y]) => ({ x, y }));
const trap = (squares: { x: number; y: number }[], trapId: BoardTrap['trapId']) => ({
  type: 'PaintTerrain',
  squares,
  paint: { kind: 'trap', trapId, tier: 1, hidden: true },
});
const reasonOf = (result: CommandResult) =>
  result.status === 'rejected' && result.code === 'ILLEGAL_ACTION'
    ? result.message
    : codeOf(result);
const outcomeOf = (result: CommandResult) =>
  result.status === 'accepted' ? result.outcome : undefined;
const trapsNow = async (world: RoadWorld) => (await world.encounter()).battlefield.traps ?? [];

async function untilElowen(world: RoadWorld) {
  for (let turn = 0; turn < 8; turn += 1) {
    const encounter = await world.encounter();
    const current = encounter.combatants[encounter.currentIndex]?.entityId;
    if (turn > 0 && current === ELOWEN) return;
    await world.dm({ type: 'EndTurn', combatantId: current });
  }
}

describe('finding traps', () => {
  it('notices a Search trap coming near, by Passive Perception, and stops short of it', async () => {
    const world = await roadWorld();
    await startAmbush(world);
    const elowen = vitalsOf(await world.state(), ELOWEN);
    if (!elowen) throw new Error('no Elowen');
    // The net's trip wire is found at DC 11 (SRD 5.2.1).
    expect(passivePerception(elowen)).toBeGreaterThanOrEqual(11);
    await world.dm(trap(at([5, 6]), 'falling-net'));
    const moved = await world.submit({
      type: 'MoveCombatant',
      combatantId: ELOWEN,
      path: at([3, 6], [4, 6], [5, 6], [6, 6]),
    });
    expect(outcomeOf(moved)).toMatchObject({
      position: { x: 4, y: 6 },
      noticed: ['falling-net'],
    });
    expect(await trapsNow(world)).toMatchObject([{ trapId: 'falling-net', found: true }]);
    expect((await trapsNow(world))[0]?.springs).toBeUndefined();
    await verifyHistory(world);
  });

  it('never notices a Study trap by passing it: the pit springs', async () => {
    const world = await roadWorld();
    await startAmbush(world);
    await world.dm(trap(at([4, 6]), 'hidden-pit'));
    const moved = await world.submit({
      type: 'MoveCombatant',
      combatantId: ELOWEN,
      path: at([3, 6], [4, 6], [5, 6]),
    });
    expect(outcomeOf(moved)).toMatchObject({ position: { x: 4, y: 6 }, trap: 'hidden-pit' });
    expect(outcomeOf(moved)).not.toHaveProperty('noticed');
  });

  it('finds a trap within 5 feet by a Search’s Perception, or a Study’s Investigation', async () => {
    const world = await roadWorld();
    await startAmbush(world);
    await world.dm(trap(at([3, 6]), 'poisoned-darts'));
    await world.dm(trap(at([1, 6]), 'spiked-pit'));
    // Insight is a Search's skill, but finds no trap.
    world.roll(20, 20);
    const sensed = await world.submit({
      type: 'TakeAction',
      combatantId: ELOWEN,
      action: 'search',
      skill: 'insight',
    });
    expect(codeOf(sensed)).toBe('accepted');
    expect(outcomeOf(sensed)).toBeUndefined();
    await untilElowen(world);
    world.roll(20, 20);
    const searched = await world.submit({
      type: 'TakeAction',
      combatantId: ELOWEN,
      action: 'search',
      skill: 'perception',
    });
    // The darts are a Search's; the spiked pit waits for a Study.
    expect(outcomeOf(searched)).toEqual({ kind: 'TakeAction', found: ['poisoned-darts'] });
    await untilElowen(world);
    world.roll(20, 20);
    const studied = await world.submit({
      type: 'TakeAction',
      combatantId: ELOWEN,
      action: 'study',
      skill: 'investigation',
    });
    expect(outcomeOf(studied)).toEqual({ kind: 'TakeAction', found: ['spiked-pit'] });
    expect((await trapsNow(world)).every((one) => one.found === true)).toBe(true);
    const found = (await recorded(world, studied)).filter((event) => event.type === 'TrapChanged');
    expect(found).toHaveLength(1);
    await verifyHistory(world);
  });
});

describe('disarming traps', () => {
  it('takes Utilize on a known trap within 5 feet, and it springs no more', async () => {
    const world = await roadWorld();
    await startAmbush(world);
    await world.dm(trap(at([3, 6]), 'poisoned-darts'));
    await world.dm(trap(at([2, 8]), 'poisoned-darts'));
    // A hidden trap and an empty square are refused alike: nothing tells one from the other.
    const utilize = (x: number, y: number) =>
      world.submit({
        type: 'TakeAction',
        combatantId: ELOWEN,
        action: 'utilize',
        square: { x, y },
      });
    expect(reasonOf(await utilize(3, 6))).toBe('NO_KNOWN_TRAP');
    expect(reasonOf(await utilize(4, 6))).toBe('NO_KNOWN_TRAP');
    world.roll(20, 20);
    await world.submit({
      type: 'TakeAction',
      combatantId: ELOWEN,
      action: 'search',
      skill: 'perception',
    });
    await untilElowen(world);
    const disarmed = await utilize(3, 6);
    expect(outcomeOf(disarmed)).toEqual({
      kind: 'TakeAction',
      found: [],
      disarmed: 'poisoned-darts',
    });
    expect((await trapsNow(world)).find((one) => one.squares[0]?.x === 3)).toMatchObject({
      disarmed: true,
    });
    await untilElowen(world);
    const moved = await world.submit({
      type: 'MoveCombatant',
      combatantId: ELOWEN,
      path: at([3, 6]),
    });
    expect(outcomeOf(moved)).not.toHaveProperty('trap');
    await verifyHistory(world);
  });

  it('is out of reach beyond 5 feet', async () => {
    const world = await roadWorld();
    await startAmbush(world);
    await world.dm({
      type: 'PaintTerrain',
      squares: at([6, 6]),
      paint: { kind: 'trap', trapId: 'falling-net', tier: 1, hidden: false },
    });
    const far = await world.submit({
      type: 'TakeAction',
      combatantId: ELOWEN,
      action: 'utilize',
      square: { x: 6, y: 6 },
    });
    expect(reasonOf(far)).toBe('OUT_OF_RANGE');
  });
});
