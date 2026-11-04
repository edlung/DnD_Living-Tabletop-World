import { describe, expect, it } from 'vitest';

import ambush from '../../../fixtures/ravenford/road-ambush.json' with { type: 'json' };
import { entityContext } from './entity-context.ts';
import { ELOWEN, elowenView, seedRavenford } from './testing/ravenford.ts';

/**
 * A Druid in Wild Shape's form in a fight (docs/adr/0056-characters-from-the-srd.md §5): its form's
 * attacks are offered at a creature, its weapons and spells are not.
 */
describe('a Druid in a wolf’s shape', () => {
  it('is offered the wolf’s bite, and no weapon or spell', async () => {
    const world = await seedRavenford();
    const sheet = (await world.current()).characterSheets.get(ELOWEN);
    if (!sheet) throw new Error('no sheet');
    await world.apply(
      {
        type: 'SetCharacterSheet',
        entityId: ELOWEN,
        sheet: { ...sheet, classes: [{ classId: 'druid', level: 4 }], shape: { formId: 'wolf' } },
      },
      ...ambush.place,
      structuredClone(ambush.startCombat),
    );
    const state = await world.current();
    const result = entityContext(state, elowenView(state), 'creature-10fb59d4');
    if (!result.ok) throw new Error(result.reason);
    const offered = result.context.actions.map((action) => action.id);
    expect(offered).toContain('form_attack');
    expect(result.context.actions.find((action) => action.id === 'form_attack')).toMatchObject({
      formAttack: { attackId: 'bite', name: 'Bite' },
      // The raider stands 30 ft off: the wolf must close in first.
      legal: false,
    });
    for (const gone of ['longbow_attack', 'weapon_attack', 'fireball', 'cast_spell'] as const)
      expect(offered).not.toContain(gone);
  });
});
