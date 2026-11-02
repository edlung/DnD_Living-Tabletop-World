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
    const raider = await contextOf(world, 'creature-10fb59d4');
    expect(raider.visibleState).toEqual({ present: true, status: 'active', distanceFt: 30 });
    expect(JSON.stringify(raider)).not.toContain('hitPoints');
    expect((await contextOf(world, ELOWEN)).visibleState).toMatchObject({
      distanceFt: 0,
      hitPoints: { current: 78, max: 78 },
    });
  });

  it('offers Fireball centered on a goblin with the combatants it would hit', async () => {
    const world = await inCombat();
    const fireball = action(await contextOf(world, 'creature-10fb59d4'), 'fireball');
    expect(fireball).toMatchObject({ legal: true, cost: { kind: 'slot', slotLevel: 3 } });
    // Initiative order; all tie at 13, so Dexterity puts the Raiders first.
    expect(ids(fireball)).toEqual([
      'creature-10fb59d4',
      'creature-589f6668',
      'creature-6513bec0',
      'creature-ae08be99',
    ]);
    expect(fireball.hints).toBeUndefined();
    expect(action(await contextOf(world, 'creature-10fb59d4'), 'longbow_attack')).toMatchObject({
      legal: true,
    });
  });

  it('warns, without blocking, when a party member is inside the area', async () => {
    const world = await inCombat((command) => ({
      ...command,
      combatants: command.combatants.map((c) =>
        c.entityId === 'creature-10fb59d4' ? { ...c, position: { x: 3, y: 6 } } : c,
      ),
    }));
    const fireball = action(await contextOf(world, 'creature-10fb59d4'), 'fireball');
    expect(fireball).toMatchObject({ legal: true, hints: ['ALLY_IN_AREA'] });
    expect(ids(fireball)).toContain(ELOWEN);
  });

  it('reports range with the movement needed, and long range as a hint', async () => {
    const world = await inCombat((command) => ({
      ...command,
      battlefield: { ...command.battlefield, width: 40 },
      combatants: command.combatants.map((c) =>
        c.entityId === 'creature-6513bec0' ? { ...c, position: { x: 39, y: 6 } } : c,
      ),
    }));
    const far = await contextOf(world, 'creature-6513bec0');
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
      targetId: 'creature-589f6668',
    };
    await world.submit(shot);
    await world.submit(shot);
    const spent = await contextOf(world, 'creature-10fb59d4');
    expect(action(spent, 'longbow_attack')).toMatchObject({ legal: false, reason: 'NO_ACTION' });
    expect(action(spent, 'fireball')).toMatchObject({ legal: false, reason: 'NO_ACTION' });
    // Two hits killed Raider 2: the dead are outside the area.
    expect(ids(action(spent, 'fireball'))).not.toContain('creature-589f6668');
    expect(action(spent, 'hunters_mark')).toMatchObject({ legal: true, cost: { kind: 'free' } });
    await world.submit({ type: 'EndTurn', combatantId: ELOWEN });
    const waiting = await contextOf(world, 'creature-10fb59d4');
    expect(action(waiting, 'hunters_mark')).toMatchObject({ reason: 'NOT_YOUR_TURN' });
  });

  it('lists the actions beside Attack and Magic after them, judged as the engine judges', async () => {
    const world = await inCombat();
    // On herself: her own actions; Hide wants cover she lacks (ADR 0045 §5).
    const self = await contextOf(world, ELOWEN);
    for (const own of ['dodge', 'dash', 'disengage', 'search', 'study', 'utilize'] as const) {
      expect(action(self, own).legal, own).toBe(true);
    }
    expect(action(self, 'hide')).toMatchObject({ legal: false, reason: 'NO_COVER_TO_HIDE' });
    expect(self.actions.some((a) => a.id === 'help')).toBe(false);
    // On a raider 30 ft away: Ready and Influence, Help only from 5 ft — and all after the attacks
    // and spells, so a narrow tray shows those first.
    const raider = await contextOf(world, 'creature-10fb59d4');
    expect(action(raider, 'help')).toMatchObject({ legal: false, reason: 'OUT_OF_RANGE' });
    expect(action(raider, 'ready').legal).toBe(true);
    expect(action(raider, 'influence').legal).toBe(true);
    const order: readonly string[] = raider.actions.map((a) => a.id);
    const last = (list: readonly string[]) => Math.max(...list.map((id) => order.indexOf(id)));
    expect(last(['hunters_mark', 'longbow_attack', 'fireball'])).toBeLessThan(
      order.indexOf('help'),
    );
    expect(raider.actions.some((a) => a.id === 'dodge')).toBe(false);
  });

  it('keeps legal actions aligned with the World Engine', async () => {
    const world = await inCombat();
    const context = await contextOf(world, 'creature-10fb59d4');
    expect(action(context, 'fireball').legal).toBe(true);
    const cast = await world.submit({
      type: 'CastSpell',
      combatantId: ELOWEN,
      spellId: 'fireball',
      point: { x: 8, y: 4 },
    });
    expect(cast.status).toBe('accepted');
    const after = await contextOf(world, 'creature-ae08be99');
    const result = await world.submit({
      type: 'Attack',
      combatantId: ELOWEN,
      attackId: 'longbow',
      targetId: 'creature-ae08be99',
    });
    expect(result.status === 'rejected' ? result.message : 'accepted').toBe(
      action(after, 'longbow_attack').reason ?? 'accepted',
    );
  });
});
