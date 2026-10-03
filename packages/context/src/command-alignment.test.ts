import type { CommandResult, ContextAction } from '@ltw/contracts';
import type { WorldState } from '@ltw/domain';
import { describe, expect, it } from 'vitest';

import { entityContext } from './entity-context.ts';
import { DM, ELOWEN, elowenView, seedRavenford, type SeededWorld } from './testing/ravenford.ts';

/**
 * Context legality and World Engine acceptance agree (docs/adr/0013-investigation.md §1):
 * every executable context action is tried as a command, compared, then undone.
 * `AskAbout` may be NO_EFFECT when nothing is shared: that outcome is hidden
 * from context on purpose, so it counts as "legal".
 */
const EXECUTABLE: Partial<
  Record<ContextAction['id'], (entityId: string, action: ContextAction) => Record<string, unknown>>
> = {
  enter_location: (locationId) => ({ type: 'EnterLocation', characterId: ELOWEN, locationId }),
  inspect: (entityId) => ({
    type: 'ExamineEntity',
    characterId: ELOWEN,
    entityId,
    method: 'inspect',
  }),
  investigation_check: (entityId) => ({
    type: 'ExamineEntity',
    characterId: ELOWEN,
    entityId,
    method: 'investigation',
  }),
  perception_check: (entityId) => ({
    type: 'ExamineEntity',
    characterId: ELOWEN,
    entityId,
    method: 'perception',
  }),
  ask_about: (npcId, action) => ({
    type: 'AskAbout',
    characterId: ELOWEN,
    npcId,
    topicId: action.topic?.entityId,
  }),
};

const acceptedOrHidden = (result: CommandResult, id: string) =>
  result.status !== 'rejected' || (id === 'ask_about' && result.code === 'NO_EFFECT');

async function compareAll(world: SeededWorld, state: WorldState) {
  const view = elowenView(state);
  let compared = 0;
  for (const entityId of state.entities.keys()) {
    const result = entityContext(state, view, entityId);
    if (!result.ok) continue;
    for (const action of result.context.actions) {
      const build = EXECUTABLE[action.id];
      if (!build) continue;
      world.roll(10);
      const outcome = await world.submit(build(entityId, action));
      expect(
        acceptedOrHidden(outcome, action.id),
        `${action.id} ${entityId} ${JSON.stringify(outcome)}`,
      ).toBe(action.legal);
      if (outcome.status === 'accepted') {
        const undo = await world.submit(
          { type: 'UndoCommand', targetCommandId: outcome.commandId },
          DM,
        );
        expect(undo.status).toBe('accepted');
      }
      compared += 1;
    }
  }
  return compared;
}

describe('context legality matches command acceptance', () => {
  it('in Market Square', async () => {
    const world = await seedRavenford();
    expect(await compareAll(world, world.state)).toBeGreaterThan(20);
  });

  it('at the caravan site, after some checks were attempted', async () => {
    const world = await seedRavenford();
    await world.submit({
      type: 'EnterLocation',
      characterId: ELOWEN,
      locationId: 'old-trade-road',
    });
    await world.submit({
      type: 'EnterLocation',
      characterId: ELOWEN,
      locationId: 'abandoned-caravan-site',
    });
    world.roll(15);
    await world.submit({
      type: 'ExamineEntity',
      characterId: ELOWEN,
      entityId: 'goblin-weapon',
      method: 'investigation',
    });
    const state = await world.current();
    const blade = entityContext(state, elowenView(state), 'goblin-weapon');
    expect(
      blade.ok && blade.context.actions.find((a) => a.id === 'investigation_check'),
    ).toMatchObject({
      legal: false,
      reason: 'ALREADY_ATTEMPTED',
    });
    expect(await compareAll(world, state)).toBeGreaterThan(20);
  });

  it('when the character is dead or Incapacitated', async () => {
    const world = await seedRavenford();
    const sheet = world.state.characterSheets.get(ELOWEN);
    await world.apply({
      type: 'SetCharacterSheet',
      entityId: ELOWEN,
      sheet: { ...sheet, conditions: ['incapacitated'] },
    });
    expect(await compareAll(world, await world.current())).toBeGreaterThan(10);
    await world.apply({ type: 'ChangeEntityStatus', entityId: ELOWEN, status: 'dead' });
    expect(await compareAll(world, await world.current())).toBeGreaterThan(10);
  });
});
