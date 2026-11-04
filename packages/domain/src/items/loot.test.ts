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
import type { Actor } from '../kernel/actor.ts';
import { resolvePerspective } from '../knowledge/perspective.ts';
import { PARTY_STASH, possessionOf } from './records.ts';
import { inventoryView } from './view.ts';

/**
 * What the DM gives creatures and leaves at places, and the party's stash
 * (docs/adr/0057-encounters-maps-loot.md §7): a creature carries; treasure granted to a place lies
 * there for anyone there to take; a member puts part of a stack in the stash, and another member,
 * wherever they are, takes it — no one outside the party.
 */
const FRIEND: Actor = { actorId: 'player-friend', kind: 'user' };
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
const verified = async () => {
  const state = await harness.state();
  expect(checkWorldIntegrity(state)).toEqual([]);
  return state;
};

beforeEach(async () => {
  harness = createHarness();
  await seedBasicWorld(harness);
  for (const command of [
    create('hero', 'character', at('square')),
    create('friend', 'character', at('inn')),
    create('stranger', 'npc', at('square')),
    create('wolf', 'creature', at('square')),
    create('fang', 'item'),
    create('hoard', 'item'),
    create('purse', 'item'),
    { type: 'AssignCharacter', characterId: 'hero', playerActorId: PLAYER.actorId },
    { type: 'AssignCharacter', characterId: 'friend', playerActorId: FRIEND.actorId },
  ])
    expectAccepted(await harness.submit(command));
});

describe('creatures and places', () => {
  it('lets a creature carry what the DM gives it', async () => {
    expectAccepted(
      await harness.submit({
        type: 'GrantItem',
        itemId: 'fang',
        holderId: 'wolf',
        catalogId: 'gold-crown',
        quantity: 3,
      }),
    );
    expect(possessionOf(await verified(), 'fang')).toMatchObject({ holderId: 'wolf', quantity: 3 });
  });

  it('leaves treasure granted to a place lying there, for anyone there to take', async () => {
    expectAccepted(
      await harness.submit({
        type: 'GrantItem',
        itemId: 'hoard',
        holderId: 'square',
        catalogId: 'gold-crown',
        quantity: 30,
      }),
    );
    const state = await verified();
    expect(possessionOf(state, 'hoard')).toMatchObject({ holderId: null, quantity: 30 });
    expect(state.entities.get('hoard')?.placement?.locationId).toBe('square');
    expectRejected(
      await harness.submit(
        { type: 'TakeItem', characterId: 'friend', itemId: 'hoard' },
        { actor: FRIEND },
      ),
      'NOT_PRESENT',
    );
    expectAccepted(
      await harness.submit(
        { type: 'TakeItem', characterId: 'hero', itemId: 'hoard' },
        { actor: PLAYER },
      ),
    );
    expect(possessionOf(await verified(), 'hoard')).toMatchObject({
      holderId: 'hero',
      quantity: 30,
    });
  });
});

describe('the party’s stash', () => {
  it('takes part of a member’s stack, and gives it to another member wherever they are', async () => {
    expectAccepted(
      await harness.submit({
        type: 'GrantItem',
        itemId: 'purse',
        holderId: 'hero',
        catalogId: 'gold-crown',
        quantity: 20,
      }),
    );
    // Someone outside the party keeps no stash.
    expectAccepted(
      await harness.submit({
        type: 'GrantItem',
        itemId: 'fang',
        holderId: 'stranger',
        catalogId: 'silver-mark',
        quantity: 2,
      }),
    );
    expectRejected(
      await harness.submit({
        type: 'GiveItem',
        characterId: 'stranger',
        itemId: 'fang',
        toHolderId: PARTY_STASH,
      }),
      'FORBIDDEN',
    );
    const stashed = await harness.submit(
      {
        type: 'GiveItem',
        characterId: 'hero',
        itemId: 'purse',
        toHolderId: PARTY_STASH,
        quantity: 5,
      },
      { actor: PLAYER },
    );
    expectAccepted(stashed);
    const state = await verified();
    expect(possessionOf(state, 'purse')).toMatchObject({ holderId: 'hero', quantity: 15 });
    // Every member sees what lies in it, the friend at the inn too.
    const access = resolvePerspective(state, FRIEND, { kind: 'PLAYER' });
    if (!access.ok) throw new Error(access.reason);
    const stash = inventoryView(state, access.perspective, 'friend')?.stash ?? [];
    expect(stash.map((item) => item.quantity)).toEqual([5]);
    const [part] = stash;
    if (!part) throw new Error('nothing in the stash');
    expectRejected(
      await harness.submit({ type: 'TakeItem', characterId: 'stranger', itemId: part.itemId }),
      'NOT_PRESENT',
    );
    expectAccepted(
      await harness.submit(
        { type: 'TakeItem', characterId: 'friend', itemId: part.itemId },
        { actor: FRIEND },
      ),
    );
    expect(possessionOf(await verified(), part.itemId)).toMatchObject({
      holderId: 'friend',
      quantity: 5,
    });
  });
});
