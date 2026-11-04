import { beforeEach, describe, expect, it } from 'vitest';

import {
  PLAYER,
  createHarness,
  expectAccepted,
  expectRejected,
  seedBasicWorld,
  type Harness,
} from '../kernel/testing/kernel-harness.ts';
import { checkWorldIntegrity } from '../kernel/projections/integrity.ts';
import type { WorldState } from '../kernel/state.ts';
import { carriedBy, possessionOf } from './records.ts';

/**
 * Coins shared out (docs/adr/0057-encounters-maps-loot.md §7): the hero pools ten crowns and five
 * marks and a penny (1,051 pennies) among three of the party here — 350 each in the largest coins,
 * the penny that does not divide kept; a member elsewhere, someone outside the party, or too few
 * coins are refused.
 */
let harness: Harness;

const create = (entityId: string, kind: string, extra: Record<string, unknown> = {}) => ({
  type: 'CreateEntity',
  entityId,
  kind,
  name: entityId,
  existsSince: null,
  ...extra,
});
const at = (locationId: string) => ({ placement: { locationId, since: null } });
const assign = (characterId: string, playerActorId: string) => ({
  type: 'AssignCharacter',
  characterId,
  playerActorId,
});
const grant = (itemId: string, catalogId: string, quantity: number, holderId = 'hero') => ({
  type: 'GrantItem',
  itemId,
  holderId,
  catalogId,
  quantity,
});
const split = (amongIds: string[], characterId = 'hero') =>
  harness.submit({ type: 'SplitCoins', characterId, amongIds }, { actor: PLAYER });

/** A holder's coins, by catalog entry. */
function purse(state: WorldState, holderId: string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const itemId of carriedBy(state, holderId)) {
    const possession = possessionOf(state, itemId);
    if (!possession?.catalogId) continue;
    counts[possession.catalogId] = (counts[possession.catalogId] ?? 0) + possession.quantity;
  }
  return counts;
}

beforeEach(async () => {
  harness = createHarness();
  await seedBasicWorld(harness);
  for (const command of [
    create('hero', 'character', at('square')),
    create('friend', 'character', at('square')),
    create('third', 'character', at('square')),
    create('far', 'character', at('inn')),
    create('stranger', 'npc', at('square')),
    create('crowns', 'item'),
    create('marks', 'item'),
    create('penny', 'item'),
    assign('hero', PLAYER.actorId),
    assign('friend', 'player-friend'),
    assign('third', 'player-third'),
    assign('far', 'player-far'),
    grant('crowns', 'gold-crown', 10),
    grant('marks', 'silver-mark', 5),
    grant('penny', 'copper-penny', 1),
  ])
    expectAccepted(await harness.submit(command));
});

describe('SplitCoins', () => {
  it('shares the worth evenly in the largest coins, keeping what does not divide', async () => {
    expectAccepted(await split(['hero', 'friend', 'third']));
    const state = await harness.state();
    expect(checkWorldIntegrity(state)).toEqual([]);
    expect(purse(state, 'friend')).toEqual({ 'gold-crown': 3, 'silver-mark': 5 });
    expect(purse(state, 'third')).toEqual({ 'gold-crown': 3, 'silver-mark': 5 });
    expect(purse(state, 'hero')).toEqual({ 'gold-crown': 3, 'silver-mark': 5, 'copper-penny': 1 });
    // The hero's old stacks are spent.
    expect(state.entities.get('crowns')?.status).toBe('destroyed');
  });

  it('gives it all away when the sharer names only the others', async () => {
    expectAccepted(await split(['friend']));
    const state = await harness.state();
    expect(purse(state, 'friend')).toEqual({
      'gold-crown': 10,
      'silver-mark': 5,
      'copper-penny': 1,
    });
    expect(purse(state, 'hero')).toEqual({});
  });

  it('is refused for a member elsewhere, someone outside the party, or too few coins', async () => {
    expectRejected(await split(['hero', 'far']), 'NOT_PRESENT');
    expectRejected(await split(['hero', 'stranger']), 'NOT_PRESENT');
    // Two pennies among three: nothing to share.
    for (const command of [create('loose', 'item'), grant('loose', 'copper-penny', 2, 'friend')])
      expectAccepted(await harness.submit(command));
    expectRejected(
      await harness.submit(
        { type: 'SplitCoins', characterId: 'friend', amongIds: ['friend', 'hero', 'third'] },
        { actor: { actorId: 'player-friend', kind: 'user' } },
      ),
      'NO_EFFECT',
    );
  });
});
