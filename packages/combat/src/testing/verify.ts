import { checkWorldIntegrity, redecideEffective, replay } from '@ltw/domain';
import { expect } from 'vitest';

import { createCombatEngine } from '../engine.ts';
import { CAMPAIGN, type RoadWorld } from './road.ts';

/**
 * The history checks every combat test can end with (ADR 0006, ADR 0016):
 * replay reproduces the state, the state is consistent, and every effective
 * command decides the same way again from scratch.
 */
export async function verifyHistory(world: RoadWorld): Promise<void> {
  const state = await world.state();
  const history = (await world.store.loadStream(CAMPAIGN))?.events ?? [];
  expect(replay(history)).toEqual(state);
  expect(checkWorldIntegrity(state)).toEqual([]);
  expect(
    redecideEffective(
      await world.engine.commandLog(CAMPAIGN),
      { state, history },
      () => 0,
      createCombatEngine(),
    ),
  ).toBeNull();
}
