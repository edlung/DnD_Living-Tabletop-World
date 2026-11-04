import type { BoardTrap, CommandResult, PerspectiveRequest } from '@ltw/contracts';
import { resolvePerspective, type Actor, type WorldState } from '@ltw/domain';
import { describe, expect, it } from 'vitest';

import { trapArmed } from './board-traps.ts';
import {
  DM,
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
import { encounterView } from './view.ts';

/**
 * Traps and harmful ground on the Old Trade Road (docs/adr/0057-encounters-maps-loot.md §6):
 * Elowen at (2, 6) acts first, Raider 1 stands at (8, 4). A trap stops a move on it and springs;
 * it is the DM's to see until found or sprung; it catches its creature, or all on it; it resets
 * as its words say; harmful ground harms each square entered and at a turn's start.
 */
const reasonOf = (result: CommandResult) =>
  result.status === 'rejected' ? result.message : result.status;
const at = (...squares: [number, number][]) => squares.map(([x, y]) => ({ x, y }));

function seen(state: WorldState, actor: Actor, request: PerspectiveRequest) {
  const access = resolvePerspective(state, actor, request);
  if (!access.ok) throw new Error(access.reason);
  const view = encounterView(state, access.perspective);
  if (!view) throw new Error('no fight');
  return view;
}
const asDm = (state: WorldState) => seen(state, DM, { kind: 'DM' });
const hp = (state: WorldState, id: string) =>
  asDm(state).combatants.find((one) => one.entity.entityId === id)?.hitPoints?.current ?? -1;
const trap = (
  squares: { x: number; y: number }[],
  trapId: BoardTrap['trapId'] = 'hidden-pit',
  hidden = true,
  tier = 1,
) => ({ type: 'PaintTerrain', squares, paint: { kind: 'trap', trapId, tier, hidden } });

/** Ends turns until Elowen's comes again. */
async function untilElowen(world: RoadWorld): Promise<CommandResult[]> {
  const ended: CommandResult[] = [];
  for (let turn = 0; turn < 8; turn += 1) {
    const encounter = await world.encounter();
    const current = encounter.combatants[encounter.currentIndex]?.entityId;
    if (turn > 0 && current === ELOWEN) break;
    ended.push(await world.dm({ type: 'EndTurn', combatantId: current }));
  }
  return ended;
}

describe('traps on the board', () => {
  it('stop a creature on a hidden pit, drop it in, and open the pit for all to see', async () => {
    const world = await roadWorld();
    await startAmbush(world);
    expect(codeOf(await world.dm(trap(at([4, 6]))))).toBe('accepted');
    expect(seen(await world.state(), PLAYER, { kind: 'PLAYER' }).battlefield.traps).toEqual([]);
    expect(asDm(await world.state()).battlefield.traps).toHaveLength(1);
    const before = hp(await world.state(), ELOWEN);
    const moved = await world.submit({
      type: 'MoveCombatant',
      combatantId: ELOWEN,
      path: at([3, 6], [4, 6], [5, 6]),
    });
    expect(codeOf(moved)).toBe('accepted');
    // Her player is told: where she stopped, the trap, the fall and Prone.
    expect(moved.status === 'accepted' ? moved.outcome : null).toMatchObject({
      kind: 'MoveCombatant',
      position: { x: 4, y: 6 },
      trap: 'hidden-pit',
      fell: { feet: 10 },
      prone: true,
    });
    const encounter = await world.encounter();
    expect(encounter.combatants.find((one) => one.entityId === ELOWEN)?.position).toEqual({
      x: 4,
      y: 6,
    });
    expect(encounter.battlefield.ground).toContainEqual({ x: 4, y: 6, ft: -10 });
    const state = await world.state();
    expect(hp(state, ELOWEN)).toBeLessThan(before);
    const view = seen(state, PLAYER, { kind: 'PLAYER' });
    expect(view.battlefield.traps).toMatchObject([
      { trapId: 'hidden-pit', found: true, springs: 1 },
    ]);
    expect(view.combatants.find((one) => one.entity.entityId === ELOWEN)?.conditions).toContain(
      'prone',
    );
    // Spent: the open pit is a pit now, and springs no more.
    expect(trapArmed(encounter.battlefield.traps?.[0] as BoardTrap, encounter)).toBe(false);
    await verifyHistory(world);
  });

  it('catch every creature under a collapsing roof, which leaves its rubble', async () => {
    const world = await roadWorld();
    await startAmbush(world);
    await world.dm(trap(at([7, 5], [8, 5], [8, 4]), 'collapsing-roof', false));
    const before = await world.state();
    const moved = await world.submit({
      type: 'MoveCombatant',
      combatantId: ELOWEN,
      path: at([3, 6], [4, 6], [5, 6], [6, 5], [7, 5]),
    });
    expect(codeOf(moved)).toBe('accepted');
    const after = await world.state();
    expect(hp(after, ELOWEN)).toBeLessThan(hp(before, ELOWEN));
    expect(hp(after, RAIDER_1)).toBeLessThan(hp(before, RAIDER_1));
    const field = (await world.encounter()).battlefield;
    for (const square of at([7, 5], [8, 5], [8, 4])) expect(field.difficult).toContainEqual(square);
    await verifyHistory(world);
  });

  it('spring the statue again on a later turn, on one that starts its turn on it', async () => {
    const world = await roadWorld();
    await startAmbush(world);
    // In sight: hidden, her Passive Perception would find its plate and she would stop short.
    await world.dm(trap(at([3, 6]), 'fire-casting-statue', false));
    await world.submit({ type: 'MoveCombatant', combatantId: ELOWEN, path: at([3, 6]) });
    expect((await world.encounter()).battlefield.traps?.[0]?.springs).toBe(1);
    const ended = await untilElowen(world);
    const last = ended.at(-1);
    if (!last) throw new Error('no turn passed');
    const events = await recorded(world, last);
    expect(events.some((event) => event.type === 'TrapChanged')).toBe(true);
    expect((await world.encounter()).battlefield.traps?.[0]?.springs).toBe(2);
    await verifyHistory(world);
  });

  it('reset as their words say: the darts three times, each in a later turn', () => {
    const darts: BoardTrap = {
      trapId: 'poisoned-darts',
      tier: 1,
      squares: at([1, 1]),
      hidden: false,
      springs: 2,
      lastSprung: { round: 1, turn: 0 },
    };
    const turn = (round: number, currentIndex: number) =>
      ({ round, currentIndex }) as Parameters<typeof trapArmed>[1];
    expect(trapArmed(darts, turn(1, 0))).toBe(false);
    expect(trapArmed(darts, turn(1, 1))).toBe(true);
    expect(trapArmed({ ...darts, springs: 3 }, turn(2, 0))).toBe(false);
    expect(trapArmed({ ...darts, trapId: 'falling-net', springs: 1 }, turn(3, 0))).toBe(false);
    expect(trapArmed({ ...darts, springs: 1, disarmed: true }, turn(3, 0))).toBe(false);
  });

  it('are the DM’s to set, at a tier the trap has, on 64 squares at most', async () => {
    const world = await roadWorld();
    await startAmbush(world);
    expect(codeOf(await world.submit(trap(at([4, 6]))))).toBe('FORBIDDEN');
    expect(reasonOf(await world.dm(trap(at([4, 6]), 'rolling-stone', true, 2)))).toBe(
      'That trap has no such tier',
    );
    const wide = Array.from({ length: 65 }, (_, index) => ({ x: index % 16, y: index >> 4 }));
    expect(reasonOf(await world.dm(trap(wide)))).toBe('A trap lies on 64 squares at most');
  });

  it('undo with the move that sprang it: hidden and armed again, the ground level', async () => {
    const world = await roadWorld();
    await startAmbush(world);
    await world.dm(trap(at([3, 6])));
    const moved = await world.submit({
      type: 'MoveCombatant',
      combatantId: ELOWEN,
      path: at([3, 6]),
    });
    if (moved.status !== 'accepted') throw new Error('no move');
    expect(codeOf(await world.dm({ type: 'UndoCommand', targetCommandId: moved.commandId }))).toBe(
      'accepted',
    );
    const encounter = await world.encounter();
    expect(encounter.battlefield.traps?.[0]).toEqual({
      trapId: 'hidden-pit',
      tier: 1,
      squares: [{ x: 3, y: 6 }],
      hidden: true,
    });
    expect(encounter.battlefield.ground ?? []).toEqual([]);
    expect(seen(await world.state(), PLAYER, { kind: 'PLAYER' }).battlefield.traps).toEqual([]);
    await verifyHistory(world);
  });
});

describe('harmful ground', () => {
  const fire = (squares: { x: number; y: number }[]) => ({
    type: 'PaintTerrain',
    squares,
    paint: {
      kind: 'hazard',
      hazard: {
        kind: 'fire',
        dice: { count: 1, sides: 6 },
        ability: 'dex',
        dc: 30,
        onSuccess: 'none',
      },
    },
  });
  const saves = async (world: RoadWorld, result: CommandResult) =>
    (await recorded(world, result)).filter((event) => event.type === 'SavingThrowRolled').length;

  it('harms a creature on each square it enters, and as its turn starts on it', async () => {
    const world = await roadWorld();
    await startAmbush(world);
    await world.dm(fire(at([3, 6], [4, 6])));
    const before = hp(await world.state(), ELOWEN);
    const moved = await world.submit({
      type: 'MoveCombatant',
      combatantId: ELOWEN,
      path: at([3, 6], [4, 6], [5, 6]),
    });
    expect(await saves(world, moved)).toBe(2);
    expect(hp(await world.state(), ELOWEN)).toBeLessThan(before);
    // Back on the fire, then its turn starts there: once, whatever the squares under it.
    await world.dm({ type: 'PlaceCombatant', combatantId: ELOWEN, position: { x: 4, y: 6 } });
    const ended = await untilElowen(world);
    const last = ended.at(-1);
    if (!last) throw new Error('no turn passed');
    expect(await saves(world, last)).toBe(1);
    // Everyone at the table sees the fire.
    expect(seen(await world.state(), PLAYER, { kind: 'PLAYER' }).battlefield.hazards).toHaveLength(
      2,
    );
    await verifyHistory(world);
  });
});
