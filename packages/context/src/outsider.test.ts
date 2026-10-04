import type { ContextAction, EntityContextView } from '@ltw/contracts';
import { currentCombatant, openReactionWindow } from '@ltw/domain';
import { describe, expect, it } from 'vitest';

import ambush from '../../../fixtures/ravenford/road-ambush.json' with { type: 'json' };
import { entityContext } from './entity-context.ts';
import { ELOWEN, elowenView, seedRavenford, type SeededWorld } from './testing/ravenford.ts';

/**
 * Context for a character outside a fight (Gate 03 retest 2, G03-H06; ADR 0015
 * amendment). Elowen stands on the Old Trade Road while Seren and the goblins
 * fight: her spells cannot target a combatant (`TARGET_IN_COMBAT`, exactly as
 * the World Engine decides), and nothing she sees depends on whether a
 * reaction window is open.
 */
type Phase = 'no fight' | 'a fight' | 'a fight with an open window';
const SEREN = 'seren-ashgrove';
const SPELLS: ContextAction['id'][] = ['healing_word', 'hunters_mark'];

async function arrange(phase: Phase): Promise<SeededWorld> {
  const world = await seedRavenford();
  const state = await world.current();
  await world.apply(
    {
      type: 'CreateEntity',
      entityId: SEREN,
      kind: 'character',
      name: 'Seren Ashgrove',
      existsSince: null,
      placement: { locationId: 'old-trade-road', since: null },
    },
    { type: 'SetCharacterSheet', entityId: SEREN, sheet: state.characterSheets.get(ELOWEN) },
    ...ambush.place,
  );
  if (phase === 'no fight') return world;
  await world.apply({
    ...ambush.startCombat,
    combatants: [
      ...ambush.startCombat.combatants.filter((c) => c.entityId !== ELOWEN),
      { entityId: SEREN, side: 'party', position: { x: 2, y: 8 } },
    ],
  });
  if (phase === 'a fight with an open window') {
    for (let turn = 0; turn < 8; turn += 1) {
      const encounter = (await world.current()).encounter;
      const current = encounter ? currentCombatant(encounter)?.entityId : undefined;
      if (current === 'goblin-shaman') break;
      await world.apply({ type: 'EndTurn', combatantId: current });
    }
    await world.apply({
      type: 'CastSpell',
      combatantId: 'goblin-shaman',
      spellId: 'ashen-bolt',
      targetId: SEREN,
    });
    expect(openReactionWindow(await world.current())).not.toBeNull();
  }
  return world;
}

async function contextOf(world: SeededWorld, entityId: string): Promise<EntityContextView> {
  const state = await world.current();
  const result = entityContext(state, elowenView(state), entityId);
  if (!result.ok) throw new Error(result.reason);
  return result.context;
}
const spellsOn = (context: EntityContextView) =>
  context.actions.filter((a) => SPELLS.includes(a.id));

describe('context for a character outside a fight', () => {
  it('a combatant is out of her spells’ reach in every phase of the fight', async () => {
    const shaman = async (phase: Phase) => contextOf(await arrange(phase), 'goblin-shaman');
    const none = await shaman('no fight');
    const fight = await shaman('a fight');
    const window = await shaman('a fight with an open window');
    expect(spellsOn(none).every((a) => a.legal)).toBe(true);
    for (const id of SPELLS) {
      expect(fight.actions.find((a) => a.id === id)).toMatchObject({
        legal: false,
        reason: 'TARGET_IN_COMBAT',
      });
    }
    expect(window).toEqual(fight);
  });

  it('agrees with the World Engine, and others stay in reach', async () => {
    for (const phase of ['a fight', 'a fight with an open window'] as const) {
      const world = await arrange(phase);
      for (const [id, spellId] of [
        ['healing_word', 'healing-word'],
        ['hunters_mark', 'hunters-mark'],
      ] as const) {
        const result = await world.submit({
          type: 'CastSpell',
          combatantId: ELOWEN,
          spellId,
          targetId: 'goblin-shaman',
        });
        expect(result).toMatchObject({ code: 'ILLEGAL_ACTION', message: 'TARGET_IN_COMBAT' });
        expect(
          (await contextOf(world, 'goblin-shaman')).actions.find((a) => a.id === id)?.legal,
        ).toBe(false);
      }
      expect(spellsOn(await contextOf(world, ELOWEN)).every((a) => a.legal)).toBe(true);
    }
  });
});
