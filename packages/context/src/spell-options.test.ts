import type { CharacterSheet, EntityContextView } from '@ltw/contracts';
import { describe, expect, it } from 'vitest';

import ambush from '../../../fixtures/ravenford/road-ambush.json' with { type: 'json' };
import { entityContext } from './entity-context.ts';
import { castRequest } from './spell-options.ts';
import { ELOWEN, elowenView, seedRavenford, type SeededWorld } from './testing/ravenford.ts';

/**
 * SRD spells offered in a fight (docs/adr/0052-spells-as-data.md §5): Elowen also studies as a
 * wizard; the Raider at (8, 4) is 30 ft away, its fellows and the Shaman around (11, 6).
 */
const RAIDER_1 = 'creature-10fb59d4';

async function studied(): Promise<SeededWorld> {
  const world = await seedRavenford();
  const state = await world.current();
  const sheet = state.characterSheets.get(ELOWEN) as CharacterSheet;
  await world.apply({
    type: 'SetCharacterSheet',
    entityId: ELOWEN,
    sheet: {
      ...sheet,
      spellcasting: [
        ...sheet.spellcasting,
        {
          source: 'wizard',
          ability: 'int',
          spells: ['fire-bolt', 'magic-missile', 'shatter', 'false-life', 'alarm'],
        },
      ],
    },
  });
  await world.apply(...ambush.place, ambush.startCombat);
  return world;
}

async function contextOf(world: SeededWorld, entityId: string): Promise<EntityContextView> {
  const state = await world.current();
  const result = entityContext(state, elowenView(state), entityId);
  if (!result.ok) throw new Error(result.reason);
  return result.context;
}
const spellsIn = (context: EntityContextView) =>
  context.actions.flatMap((action) =>
    action.id === 'cast_spell' && action.spell ? [{ ...action.spell, action }] : [],
  );

describe('SRD spells in a fight', () => {
  it('at a foe: a cantrip by its tier, darts with their slots, an area on its square', async () => {
    const world = await studied();
    const offered = spellsIn(await contextOf(world, RAIDER_1));
    expect(offered.map((one) => one.spellId).sort()).toEqual([
      'fire-bolt',
      'magic-missile',
      'shatter',
    ]);
    const bolt = offered.find((one) => one.spellId === 'fire-bolt');
    expect(bolt).toMatchObject({ names: true, times: 1, slots: [] });
    expect(bolt?.action).toMatchObject({ legal: true });
    expect(bolt?.action.cost).toBeUndefined();
    const darts = offered.find((one) => one.spellId === 'magic-missile');
    if (!darts) throw new Error('no Magic Missile on offer');
    expect(darts).toMatchObject({ times: 3, perSlot: 1, names: true });
    expect(darts.action.cost).toEqual({ kind: 'slot', slotLevel: 1 });
    expect(darts.slots[0]).toBe(1);
    const shatter = offered.find((one) => one.spellId === 'shatter');
    expect(shatter).toMatchObject({ aim: 'point', names: false, forDm: 'rest' });
    expect(shatter?.action.area?.affected.map((ref) => ref.entityId)).toContain(RAIDER_1);
    // The command the client builds from the option: one dart more for each level above 1.
    expect(
      castRequest(darts, { slotLevel: 3 }, { entityId: RAIDER_1, position: { x: 8, y: 4 } }),
    ).toEqual({
      spellId: 'magic-missile',
      using: { slotLevel: 3 },
      targetIds: [RAIDER_1, RAIDER_1, RAIDER_1, RAIDER_1, RAIDER_1],
    });
  });

  it('on herself: a spell of her own; never one of minutes in a fight', async () => {
    const world = await studied();
    const offered = spellsIn(await contextOf(world, ELOWEN)).map((one) => one.spellId);
    expect(offered).toEqual(['false-life']);
  });
});
