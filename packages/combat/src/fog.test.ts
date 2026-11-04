import { HIDDEN_TURN, type CommandResult, type PerspectiveRequest } from '@ltw/contracts';
import { perceivedEntityIds, resolvePerspective, type Actor, type WorldState } from '@ltw/domain';
import { describe, expect, it } from 'vitest';

import { DM, ELOWEN, PLAYER, RAIDER_1, codeOf, roadWorld, startAmbush } from './testing/road.ts';
import { verifyHistory } from './testing/verify.ts';
import { encounterView } from './view.ts';

/**
 * The fog of war on the Old Trade Road (docs/adr/0057-encounters-maps-loot.md §4): Raider 1 at
 * (8, 4). The DM hides squares; a player, the party and the display see the fog but not what lies
 * under it — the raider, from the order too (its turn is the DM's), and the ground there — while
 * the DM sees everything. Perception leaves the raider out, so nothing built on it names it.
 */
const DISPLAY: Actor = { actorId: 'display:5b1f3c9e-2d4a-4f6b-8c7d-9e0a1b2c3d4e', kind: 'display' };
const reasonOf = (result: CommandResult) =>
  result.status === 'rejected' ? result.message : result.status;

function seen(state: WorldState, actor: Actor, request: PerspectiveRequest) {
  const access = resolvePerspective(state, actor, request);
  if (!access.ok) throw new Error(access.reason);
  return encounterView(state, access.perspective);
}

const around = (x: number, y: number) =>
  [-1, 0, 1].flatMap((dy) => [-1, 0, 1].map((dx) => ({ x: x + dx, y: y + dy })));

describe('the fog of war', () => {
  it('hides a foe and its ground from the players, never from the DM', async () => {
    const world = await roadWorld();
    await startAmbush(world);
    await world.dm({
      type: 'PaintTerrain',
      squares: [{ x: 8, y: 5 }],
      paint: { kind: 'difficult' },
    });
    const hidden = await world.dm({ type: 'SetFog', squares: around(8, 4), hidden: true });
    expect(codeOf(hidden)).toBe('accepted');
    const state = await world.state();
    for (const [actor, request] of [
      [PLAYER, { kind: 'PLAYER' }],
      [PLAYER, { kind: 'PARTY' }],
      [DISPLAY, { kind: 'PARTY' }],
    ] as const) {
      const view = seen(state, actor, request);
      expect(view?.combatants.map((one) => one.entity.entityId)).not.toContain(RAIDER_1);
      expect(view?.order).not.toContain(RAIDER_1);
      expect(view?.battlefield.difficult).not.toContainEqual({ x: 8, y: 5 });
      expect(view?.battlefield.fog).toHaveLength(9);
    }
    const dm = seen(state, DM, { kind: 'DM' });
    expect(dm?.combatants.map((one) => one.entity.entityId)).toContain(RAIDER_1);
    expect(dm?.battlefield.difficult).toContainEqual({ x: 8, y: 5 });
    expect(perceivedEntityIds(state, ELOWEN).has(RAIDER_1)).toBe(false);
    await verifyHistory(world);
  });

  it('gives a hidden foe’s turn to the DM, and shows it again once revealed', async () => {
    const world = await roadWorld();
    await startAmbush(world);
    await world.dm({ type: 'SetFog', squares: around(8, 4), hidden: true });
    // The turns pass until the raider's.
    for (let turn = 0; turn < 6; turn += 1) {
      const encounter = await world.encounter();
      const current = encounter.combatants[encounter.currentIndex]?.entityId;
      if (current === RAIDER_1) break;
      await world.dm({ type: 'EndTurn', combatantId: current });
    }
    const during = await world.state();
    expect(seen(during, PLAYER, { kind: 'PLAYER' })?.currentCombatantId).toBe(HIDDEN_TURN);
    expect(seen(during, DM, { kind: 'DM' })?.currentCombatantId).toBe(RAIDER_1);
    const revealed = await world.dm({ type: 'SetFog', squares: [{ x: 8, y: 4 }], hidden: false });
    expect(codeOf(revealed)).toBe('accepted');
    const after = await world.state();
    expect(seen(after, PLAYER, { kind: 'PLAYER' })?.currentCombatantId).toBe(RAIDER_1);
    expect(perceivedEntityIds(after, ELOWEN).has(RAIDER_1)).toBe(true);
    await verifyHistory(world);
  });

  it('is the DM’s alone, on the field, and undoes', async () => {
    const world = await roadWorld();
    await startAmbush(world);
    const fog = (squares: { x: number; y: number }[], hidden = true) =>
      world.dm({ type: 'SetFog', squares, hidden });
    expect(reasonOf(await fog([{ x: 20, y: 2 }]))).toBe('A square lies outside the battlefield');
    expect(codeOf(await fog([{ x: 1, y: 1 }], false))).toBe('NO_EFFECT');
    const player = await world.submit(
      { type: 'SetFog', squares: [{ x: 1, y: 1 }], hidden: true },
      PLAYER,
    );
    expect(codeOf(player)).toBe('FORBIDDEN');
    const laid = await fog(around(8, 4));
    if (laid.status !== 'accepted') throw new Error('no fog');
    expect(codeOf(await world.dm({ type: 'UndoCommand', targetCommandId: laid.commandId }))).toBe(
      'accepted',
    );
    expect((await world.encounter()).battlefield.fog).toBeUndefined();
    await verifyHistory(world);
  });
});
