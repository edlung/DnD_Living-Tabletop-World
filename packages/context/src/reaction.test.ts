import type { ContextAction, EntityContextView } from '@ltw/contracts';
import { openReactionWindow } from '@ltw/domain';
import { describe, expect, it } from 'vitest';

import ambush from '../../../fixtures/ravenford/road-ambush.json' with { type: 'json' };
import { entityContext } from './entity-context.ts';
import { ELOWEN, elowenView, seedRavenford, type SeededWorld } from './testing/ravenford.ts';

/**
 * Context during a reaction window (docs/adr/0016-reaction-engine.md §4).
 * Every die rolls 11 here, so the order is Elowen, the Raiders, the Shaman.
 */
async function shamanCasting(): Promise<{ world: SeededWorld; windowId: string }> {
  const world = await seedRavenford();
  await world.apply(...ambush.place, ambush.startCombat);
  for (const id of [ELOWEN, 'goblin-raider-1', 'goblin-raider-2', 'goblin-raider-3']) {
    await world.apply({ type: 'EndTurn', combatantId: id });
  }
  await world.apply({
    type: 'CastSpell',
    combatantId: 'goblin-shaman',
    spellId: 'ashen-bolt',
    targetId: ELOWEN,
  });
  const window = openReactionWindow(await world.current());
  if (!window) throw new Error('no window opened');
  return { world, windowId: window.windowId };
}

async function contextOf(world: SeededWorld, entityId: string): Promise<EntityContextView> {
  const state = await world.current();
  const result = entityContext(state, elowenView(state), entityId);
  if (!result.ok) throw new Error(result.reason);
  return result.context;
}
const action = (context: EntityContextView, id: ContextAction['id']) =>
  context.actions.find((a) => a.id === id);

describe('context while a reaction window is open', () => {
  it('offers Counterspell on the caster to a pending candidate, first and legal', async () => {
    const { world } = await shamanCasting();
    const shaman = await contextOf(world, 'goblin-shaman');
    expect(shaman.actions[0]).toEqual({
      id: 'counterspell',
      legal: true,
      relevance: 'high',
      cost: { kind: 'slot', slotLevel: 3 },
    });
    expect(action(shaman, 'longbow_attack')).toMatchObject({
      legal: false,
      reason: 'REACTION_PENDING',
    });
    expect(action(shaman, 'fireball')).toMatchObject({ legal: false, reason: 'REACTION_PENDING' });
    expect(action(shaman, 'fireball')?.area?.affected.length).toBeGreaterThan(0);
    // Only the caster can be countered, and nothing names the spell.
    expect(action(await contextOf(world, 'goblin-raider-1'), 'counterspell')).toBeUndefined();
    expect(JSON.stringify(shaman)).not.toMatch(/ashen|Ashen|bolt/);
  });

  it('agrees with the World Engine, and stops offering once Elowen answered', async () => {
    const { world, windowId } = await shamanCasting();
    expect(action(await contextOf(world, 'goblin-shaman'), 'counterspell')?.legal).toBe(true);
    const used = await world.submit({
      type: 'UseReaction',
      combatantId: ELOWEN,
      windowId,
      reaction: 'counterspell',
    });
    expect(used.status).toBe('accepted');
    const after = await contextOf(world, 'goblin-shaman');
    expect(action(after, 'counterspell')).toBeUndefined();
    expect(action(after, 'longbow_attack')).toMatchObject({
      legal: false,
      reason: 'NOT_YOUR_TURN',
    });
  });
});
