import type { PerspectiveRequest } from '@ltw/contracts';
import { resolvePerspective, type Actor, type WorldState } from '@ltw/domain';
import { describe, expect, it } from 'vitest';

import { shamanCastsAtElowen } from './testing/reactions.ts';
import { DM, ELOWEN, PLAYER, RAIDER_1, SHAMAN, roadWorld, startAmbush } from './testing/road.ts';
import { encounterView } from './view.ts';

/**
 * The fight as the party sees it (docs/adr/0042-table-display.md §3, amending ADR 0015 §6): what
 * the table's display shows. A party member's view with the party's knowledge, and nothing of one
 * character's own; no encounter for the public.
 */
const DISPLAY: Actor = { actorId: 'display:5b1f3c9e-2d4a-4f6b-8c7d-9e0a1b2c3d4e', kind: 'display' };

function seen(state: WorldState, actor: Actor, request: PerspectiveRequest) {
  const access = resolvePerspective(state, actor, request);
  if (!access.ok) throw new Error(access.reason);
  return encounterView(state, access.perspective);
}

describe('the party’s view of a fight', () => {
  it('is a taking-part member’s view without the member’s own window or the DM’s rolls', async () => {
    const world = await roadWorld();
    await startAmbush(world);
    await shamanCastsAtElowen(world);
    const state = await world.state();
    const elowen = seen(state, PLAYER, { kind: 'PLAYER' });
    const party = seen(state, PLAYER, { kind: 'PARTY' });
    if (!elowen || !party) throw new Error('both see the fight');
    // Elowen's player is asked to react; the party's screen is not.
    expect(elowen.reactionWindow).not.toBeNull();
    expect(party.reactionWindow).toBeNull();
    expect(party.order).toEqual(elowen.order);
    expect(party.battlefield).toEqual(elowen.battlefield);
    for (const combatant of party.combatants) {
      const hers = elowen.combatants.find((c) => c.entity.entityId === combatant.entity.entityId);
      expect(combatant.position).toEqual(hers?.position);
      expect(combatant.state).toBe(hers?.state);
      // A name only where the party knows it, and never one Elowen does not.
      if (combatant.entity.name !== null) expect(combatant.entity.name).toBe(hers?.entity.name);
      expect('initiative' in combatant).toBe(false);
    }
    const of = (id: string) => party.combatants.find((c) => c.entity.entityId === id);
    expect(of(ELOWEN)?.hitPoints).toBeDefined();
    expect(of(RAIDER_1)?.hitPoints).toBeUndefined();
    // The table's display sees the same; the public sees no fight; the DM still sees it all.
    expect(seen(state, DISPLAY, { kind: 'PARTY' })).toEqual(party);
    expect(seen(state, PLAYER, { kind: 'PUBLIC' })).toBeNull();
    expect(seen(state, DM, { kind: 'DM' })?.combatants.every((c) => 'initiative' in c)).toBe(true);
  });
});

/**
 * What is left of a turn (docs/adr/0073-table-ideas.md §3): a character's own player reads it,
 * and the DM everyone's; the party's shared view and the table's display read nobody's.
 */
describe('what is left of a turn', () => {
  const act = (action: string) => ({ type: 'TakeAction', combatantId: ELOWEN, action });
  const turnOf = (view: ReturnType<typeof seen>, id: string) =>
    view?.combatants.find((c) => c.entity.entityId === id)?.turn;

  it('is the acting character’s own: an action, a bonus action, a reaction, her speed', async () => {
    const world = await roadWorld();
    await startAmbush(world);
    const state = await world.state();
    expect(turnOf(seen(state, PLAYER, { kind: 'PLAYER' }), ELOWEN)).toEqual({
      own: true,
      action: true,
      bonusAction: true,
      reaction: true,
      movementLeftFt: 30,
      attacksLeft: 0,
      incapacitated: false,
    });
  });

  it('follows what she spends: feet moved, the action, Dash’s second speed', async () => {
    const world = await roadWorld();
    await startAmbush(world);
    const north = [
      { x: 2, y: 5 },
      { x: 2, y: 4 },
    ];
    await world.submit({ type: 'MoveCombatant', combatantId: ELOWEN, path: north }, PLAYER);
    const moved = turnOf(seen(await world.state(), PLAYER, { kind: 'PLAYER' }), ELOWEN);
    expect(moved).toMatchObject({ action: true, movementLeftFt: 20 });
    await world.submit(act('dash'), PLAYER);
    const dashed = turnOf(seen(await world.state(), PLAYER, { kind: 'PLAYER' }), ELOWEN);
    expect(dashed).toMatchObject({ action: false, bonusAction: true, movementLeftFt: 50 });
  });

  it('is nothing to do off her turn but the reaction', async () => {
    const world = await roadWorld();
    await startAmbush(world);
    await world.submit({ type: 'EndTurn', combatantId: ELOWEN }, PLAYER);
    expect(turnOf(seen(await world.state(), PLAYER, { kind: 'PLAYER' }), ELOWEN)).toEqual({
      own: false,
      action: false,
      bonusAction: false,
      reaction: true,
      movementLeftFt: 0,
      attacksLeft: 0,
      incapacitated: false,
    });
  });

  it('is nothing at all while a condition holds her: what the rules would refuse is not offered', async () => {
    const world = await roadWorld();
    await startAmbush(world);
    await world.dm({
      type: 'SetCondition',
      targetId: ELOWEN,
      condition: 'stunned',
      applied: true,
      reason: 'The table says so',
    });
    const held = turnOf(seen(await world.state(), PLAYER, { kind: 'PLAYER' }), ELOWEN);
    expect(held).toEqual({
      own: true,
      action: false,
      bonusAction: false,
      reaction: false,
      movementLeftFt: 0,
      attacksLeft: 0,
      incapacitated: true,
    });
    // The rules agree: a move and an action are refused.
    const move = await world.submit(
      { type: 'MoveCombatant', combatantId: ELOWEN, path: [{ x: 2, y: 5 }] },
      PLAYER,
    );
    expect(move.status).toBe('rejected');
    expect((await world.submit(act('dodge'), PLAYER)).status).toBe('rejected');
  });

  it('is nobody else’s to read: not a foe’s for a player, none for the party or the display', async () => {
    const world = await roadWorld();
    await startAmbush(world);
    const state = await world.state();
    const hers = seen(state, PLAYER, { kind: 'PLAYER' });
    for (const foe of [RAIDER_1, SHAMAN]) expect(turnOf(hers, foe)).toBeUndefined();
    for (const view of [
      seen(state, PLAYER, { kind: 'PARTY' }),
      seen(state, DISPLAY, { kind: 'PARTY' }),
      seen(state, DM, { kind: 'PARTY' }),
    ]) {
      expect(view?.combatants.some((c) => 'turn' in c)).toBe(false);
    }
    // The DM reads everyone's.
    const all = seen(state, DM, { kind: 'DM' });
    expect(all?.combatants.every((c) => c.turn !== undefined)).toBe(true);
    expect(turnOf(all, SHAMAN)).toMatchObject({ own: false, action: false, reaction: true });
  });
});
