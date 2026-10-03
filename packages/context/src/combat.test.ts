import type { ContextAction, EntityContextView } from '@ltw/contracts';
import { describe, expect, it } from 'vitest';

import ambush from '../../../fixtures/ravenford/road-ambush.json' with { type: 'json' };
import { entityContext } from './entity-context.ts';
import { ELOWEN, elowenView, seedRavenford, type SeededWorld } from './testing/ravenford.ts';

/**
 * Context in combat (ADR 0015 §6). Old Trade Road ambush: Elowen (2,6) acts
 * first; Raider 1 (8,4) in half cover, Raider 2 (10,7), Raider 3 (11,5), the
 * Shaman (12,6) in three-quarters cover.
 */
type Start = typeof ambush.startCombat;

async function inCombat(change: (command: Start) => Start = (c) => c): Promise<SeededWorld> {
  const world = await seedRavenford();
  await world.apply(...ambush.place, change(structuredClone(ambush.startCombat)));
  return world;
}

async function contextOf(world: SeededWorld, entityId: string): Promise<EntityContextView> {
  const state = await world.current();
  const result = entityContext(state, elowenView(state), entityId);
  if (!result.ok) throw new Error(result.reason);
  return result.context;
}

const action = (context: EntityContextView, id: ContextAction['id']) => {
  const found = context.actions.find((a) => a.id === id);
  if (!found) throw new Error(`no ${id}`);
  return found;
};
const ids = (a: ContextAction) => a.area?.affected.map((ref) => ref.entityId);

describe('context in combat', () => {
  it('shows distance but never a goblin’s hit points', async () => {
    const world = await inCombat();
    const raider = await contextOf(world, 'goblin-raider-1');
    expect(raider.visibleState).toEqual({ present: true, status: 'active', distanceFt: 30 });
    expect(JSON.stringify(raider)).not.toContain('hitPoints');
    expect((await contextOf(world, ELOWEN)).visibleState).toMatchObject({
      distanceFt: 0,
      hitPoints: { current: 78, max: 78 },
    });
  });

  it('offers Fireball centered on a goblin with the combatants it would hit', async () => {
    const world = await inCombat();
    const fireball = action(await contextOf(world, 'goblin-raider-1'), 'fireball');
    expect(fireball).toMatchObject({ legal: true, cost: { kind: 'slot', slotLevel: 3 } });
    // Initiative order; all tie at 13, so Dexterity puts the Raiders first.
    expect(ids(fireball)).toEqual([
      'goblin-raider-1',
      'goblin-raider-2',
      'goblin-raider-3',
      'goblin-shaman',
    ]);
    expect(fireball.hints).toBeUndefined();
    expect(action(await contextOf(world, 'goblin-raider-1'), 'longbow_attack')).toMatchObject({
      legal: true,
    });
  });

  it('warns, without blocking, when a party member is inside the area', async () => {
    const world = await inCombat((command) => ({
      ...command,
      combatants: command.combatants.map((c) =>
        c.entityId === 'goblin-raider-1' ? { ...c, position: { x: 3, y: 6 } } : c,
      ),
    }));
    const fireball = action(await contextOf(world, 'goblin-raider-1'), 'fireball');
    expect(fireball).toMatchObject({ legal: true, hints: ['ALLY_IN_AREA'] });
    expect(ids(fireball)).toContain(ELOWEN);
  });

  it('reports range with the movement needed, and long range as a hint', async () => {
    const world = await inCombat((command) => ({
      ...command,
      battlefield: { ...command.battlefield, width: 40 },
      combatants: command.combatants.map((c) =>
        c.entityId === 'goblin-raider-3' ? { ...c, position: { x: 39, y: 6 } } : c,
      ),
    }));
    const far = await contextOf(world, 'goblin-raider-3');
    expect(far.visibleState.distanceFt).toBe(185);
    expect(action(far, 'fireball')).toMatchObject({
      legal: false,
      reason: 'OUT_OF_RANGE',
      resolution: { moveRequiredFt: 35 },
    });
    expect(action(far, 'longbow_attack')).toMatchObject({ legal: true, hints: ['LONG_RANGE'] });
  });

  it('follows the turn: spent action, then someone else’s turn', async () => {
    const world = await inCombat();
    const shot = {
      type: 'Attack',
      combatantId: ELOWEN,
      attackId: 'longbow',
      targetId: 'goblin-raider-2',
    };
    await world.submit(shot);
    await world.submit(shot);
    const spent = await contextOf(world, 'goblin-raider-1');
    expect(action(spent, 'longbow_attack')).toMatchObject({ legal: false, reason: 'NO_ACTION' });
    expect(action(spent, 'fireball')).toMatchObject({ legal: false, reason: 'NO_ACTION' });
    // Two hits killed Raider 2: the dead are outside the area.
    expect(ids(action(spent, 'fireball'))).not.toContain('goblin-raider-2');
    expect(action(spent, 'hunters_mark')).toMatchObject({ legal: true, cost: { kind: 'free' } });
    await world.submit({ type: 'EndTurn', combatantId: ELOWEN });
    const waiting = await contextOf(world, 'goblin-raider-1');
    expect(action(waiting, 'hunters_mark')).toMatchObject({ reason: 'NOT_YOUR_TURN' });
  });

  it('keeps legal actions aligned with the World Engine', async () => {
    const world = await inCombat();
    const context = await contextOf(world, 'goblin-raider-1');
    expect(action(context, 'fireball').legal).toBe(true);
    const cast = await world.submit({
      type: 'CastSpell',
      combatantId: ELOWEN,
      spellId: 'fireball',
      point: { x: 8, y: 4 },
    });
    expect(cast.status).toBe('accepted');
    const after = await contextOf(world, 'goblin-shaman');
    const result = await world.submit({
      type: 'Attack',
      combatantId: ELOWEN,
      attackId: 'longbow',
      targetId: 'goblin-shaman',
    });
    expect(result.status === 'rejected' ? result.message : 'accepted').toBe(
      action(after, 'longbow_attack').reason ?? 'accepted',
    );
  });
});
