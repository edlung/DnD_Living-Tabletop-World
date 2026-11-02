import { beforeEach, describe, expect, it } from 'vitest';

import rulesSeed from '../../../../fixtures/ravenford/rules-seed.json' with { type: 'json' };
import {
  PLAYER,
  createHarness,
  expectAccepted,
  expectRejected,
  seedBasicWorld,
  type Harness,
} from '../kernel/testing/kernel-harness.ts';
import { redecideEffective } from '../kernel/verification/redecide.ts';
import { checkWorldIntegrity } from '../kernel/projections/integrity.ts';
import { replay } from '../kernel/evolve.ts';
import { decideDropItem, decideTakeItem } from './decide.ts';
import { adjacentInEncounter } from './economy.ts';
import { possessionOf } from './records.ts';

/** Item possession (docs/adr/0039-item-possession.md): grant, wear, use, hand over, drop, take, undo. */
const sheet = rulesSeed.commands[0]?.sheet;
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

beforeEach(async () => {
  harness = createHarness();
  await seedBasicWorld(harness);
  for (const command of [
    create('hero', 'character', at('square')),
    create('friend', 'character', at('square')),
    create('far', 'character', at('inn')),
    create('mail', 'item'),
    create('buckler', 'item'),
    create('balm', 'item'),
    create('cloak', 'item'),
    create('letter', 'item'),
    { type: 'SetCharacterSheet', entityId: 'hero', sheet },
    { type: 'AssignCharacter', characterId: 'hero', playerActorId: PLAYER.actorId },
  ])
    expectAccepted(await harness.submit(command));
});

const grant = async (itemId: string, catalogId?: string, quantity = 1) =>
  expectAccepted(
    await harness.submit({
      type: 'GrantItem',
      itemId,
      holderId: 'hero',
      ...(catalogId ? { catalogId } : {}),
      quantity,
    }),
  );
const act = (command: Record<string, unknown>) =>
  harness.submit({ characterId: 'hero', ...command }, { actor: PLAYER });
const verified = async () => {
  const state = await harness.state();
  expect(checkWorldIntegrity(state)).toEqual([]);
  return state;
};

describe('GrantItem', () => {
  it('gives a catalog item to a carrier, once', async () => {
    await grant('mail', 'watchman-mail');
    expect(possessionOf(await verified(), 'mail')).toMatchObject({
      holderId: 'hero',
      catalogId: 'watchman-mail',
      quantity: 1,
      slot: null,
    });
    expectRejected(
      await harness.submit({ type: 'GrantItem', itemId: 'mail', holderId: 'friend' }),
      'INVALID_ITEM',
    );
  });

  it.each([
    ['an unknown catalog ID', { itemId: 'cloak', catalogId: 'sword-of-truth' }],
    ['a stack of a single item', { itemId: 'cloak', catalogId: 'caravan-cloak', quantity: 2 }],
    ['a non-carrier holder', { itemId: 'cloak', holderId: 'inn' }],
    ['a non-item', { itemId: 'friend' }],
  ])('refuses %s', async (_label, patch) => {
    const result = await harness.submit({ type: 'GrantItem', holderId: 'hero', ...patch });
    expect(result.status).toBe('rejected');
  });

  it("is the DM's alone", async () => {
    expectRejected(
      await harness.submit(
        { type: 'GrantItem', itemId: 'cloak', holderId: 'hero' },
        { actor: PLAYER },
      ),
      'FORBIDDEN',
    );
  });
});

describe('equipment and armor class', () => {
  it('changes armor class when armor and a shield are worn, and back when removed', async () => {
    await grant('mail', 'watchman-mail');
    await grant('buckler', 'oak-buckler');
    const base = (await harness.state()).characterSheets.get('hero')?.armorClass ?? 0;
    expectAccepted(await act({ type: 'EquipItem', itemId: 'buckler', slot: 'offhand' }));
    expect((await harness.state()).characterSheets.get('hero')?.armorClass).toBe(base + 1);
    expectAccepted(await act({ type: 'EquipItem', itemId: 'mail', slot: 'body' }));
    const worn = (await verified()).characterSheets.get('hero')?.armorClass ?? 0;
    expectAccepted(await act({ type: 'UnequipItem', itemId: 'mail' }));
    expectAccepted(await act({ type: 'UnequipItem', itemId: 'buckler' }));
    expect((await verified()).characterSheets.get('hero')?.armorClass).toBe(base);
    expect(worn).not.toBe(base);
  });

  it('refuses a taken slot, a wrong slot, and an item that is not gear', async () => {
    await grant('mail', 'watchman-mail');
    await grant('cloak', 'caravan-cloak');
    await grant('letter');
    expectRejected(await act({ type: 'EquipItem', itemId: 'mail', slot: 'head' }), 'INVALID_ITEM');
    expectRejected(
      await act({ type: 'EquipItem', itemId: 'letter', slot: 'body' }),
      'INVALID_ITEM',
    );
    expectAccepted(await act({ type: 'EquipItem', itemId: 'cloak', slot: 'cloak' }));
    expectRejected(await act({ type: 'EquipItem', itemId: 'cloak', slot: 'cloak' }), 'NO_EFFECT');
    expectRejected(await act({ type: 'UnequipItem', itemId: 'mail' }), 'NO_EFFECT');
  });

  it('keeps what the rules need of the body armor on the sheet while it is worn', async () => {
    // docs/adr/0050-the-world-around.md §10: the watch's mail asks Strength 13, and it rustles.
    await grant('mail', 'watchman-mail');
    expectAccepted(await act({ type: 'EquipItem', itemId: 'mail', slot: 'body' }));
    expect((await verified()).characterSheets.get('hero')?.wornArmor).toEqual({
      weight: 'heavy',
      strength: 13,
      stealthDisadvantage: true,
    });
    expectAccepted(await act({ type: 'UnequipItem', itemId: 'mail' }));
    expect((await verified()).characterSheets.get('hero')?.wornArmor).toBeUndefined();
  });

  it('undoing an equip restores both the item and the sheet', async () => {
    await grant('mail', 'watchman-mail');
    const before = (await harness.state()).characterSheets.get('hero');
    const equip = expectAccepted(await act({ type: 'EquipItem', itemId: 'mail', slot: 'body' }));
    expectAccepted(await harness.submit({ type: 'UndoCommand', targetCommandId: equip.commandId }));
    const state = await verified();
    expect(state.characterSheets.get('hero')).toEqual(before);
    expect(possessionOf(state, 'mail')?.slot).toBeNull();
  });
});

describe('UseItem', () => {
  it('heals, spends one unit, and destroys the last', async () => {
    await grant('balm', 'woodland-balm', 2);
    await harness.submit({
      type: 'SetCharacterSheet',
      entityId: 'hero',
      sheet: { ...sheet, hitPoints: { max: 78, current: 50 } },
    });
    expectAccepted(await act({ type: 'UseItem', itemId: 'balm' }));
    let state = await verified();
    expect(state.characterSheets.get('hero')?.hitPoints.current).toBe(57);
    expect(possessionOf(state, 'balm')?.quantity).toBe(1);
    expectAccepted(await act({ type: 'UseItem', itemId: 'balm' }));
    state = await verified();
    expect(state.entities.get('balm')?.status).toBe('destroyed');
    expectRejected(await act({ type: 'UseItem', itemId: 'balm' }), 'ENTITY_DESTROYED');
  });

  it('refuses a useless use and an item without an effect', async () => {
    await grant('balm', 'woodland-balm');
    await grant('cloak', 'caravan-cloak');
    expectRejected(await act({ type: 'UseItem', itemId: 'balm' }), 'NO_EFFECT');
    expectRejected(await act({ type: 'UseItem', itemId: 'cloak' }), 'INVALID_ITEM');
  });
});

describe('hand over, drop and take', () => {
  it('gives to someone who is here, not to someone far away', async () => {
    await grant('letter');
    expectRejected(
      await act({ type: 'GiveItem', itemId: 'letter', toHolderId: 'far' }),
      'NOT_PRESENT',
    );
    expectAccepted(await act({ type: 'GiveItem', itemId: 'letter', toHolderId: 'friend' }));
    expect(possessionOf(await verified(), 'letter')?.holderId).toBe('friend');
    expectRejected(
      await act({ type: 'GiveItem', itemId: 'letter', toHolderId: 'friend' }),
      'INVALID_ITEM',
    );
  });

  it('will not hand over a worn item', async () => {
    await grant('cloak', 'caravan-cloak');
    expectAccepted(await act({ type: 'EquipItem', itemId: 'cloak', slot: 'cloak' }));
    expectRejected(await act({ type: 'DropItem', itemId: 'cloak' }), 'INVALID_ITEM');
    expectRejected(
      await act({ type: 'GiveItem', itemId: 'cloak', toHolderId: 'friend' }),
      'INVALID_ITEM',
    );
  });

  it('drops an item where the character stands and takes it up again', async () => {
    await grant('letter');
    expectAccepted(await act({ type: 'DropItem', itemId: 'letter' }));
    let state = await verified();
    expect(possessionOf(state, 'letter')?.holderId).toBeNull();
    expect(state.entities.get('letter')?.placement?.locationId).toBe('square');
    expectAccepted(await act({ type: 'TakeItem', itemId: 'letter' }));
    state = await verified();
    expect(possessionOf(state, 'letter')?.holderId).toBe('hero');
  });

  it('takes an ordinary placed world item, but not one in another place', async () => {
    expectRejected(await act({ type: 'TakeItem', itemId: 'lamp' }), 'NOT_PRESENT');
    expectAccepted(
      await harness.submit({ type: 'PlaceEntity', entityId: 'lamp', locationId: 'square' }),
    );
    expectAccepted(await act({ type: 'TakeItem', itemId: 'lamp' }));
    expect(possessionOf(await verified(), 'lamp')).toMatchObject({
      holderId: 'hero',
      catalogId: null,
    });
  });

  it("refuses another player's character", async () => {
    await grant('letter');
    expectRejected(
      await harness.submit(
        { type: 'DropItem', characterId: 'hero', itemId: 'letter' },
        { actor: { actorId: 'someone-else', kind: 'user' } },
      ),
      'FORBIDDEN',
    );
  });
});

describe('history', () => {
  it('replays to the same state', async () => {
    await grant('mail', 'watchman-mail');
    await grant('balm', 'woodland-balm', 2);
    expectAccepted(await act({ type: 'EquipItem', itemId: 'mail', slot: 'body' }));
    expectAccepted(await act({ type: 'GiveItem', itemId: 'balm', toHolderId: 'friend' }));
    const snapshot = await harness.snapshot();
    expect(replay(snapshot.history)).toEqual(snapshot.state);
  });
});

describe('what others see', () => {
  it('shows a carried item only to its carrier, and a dropped one to everybody here', async () => {
    const { perceivedEntityIds } = await import('../investigation/perception.ts');
    expectAccepted(
      await harness.submit({ type: 'PlaceEntity', entityId: 'letter', locationId: 'square' }),
    );
    expect(perceivedEntityIds(await harness.state(), 'friend').has('letter')).toBe(true);
    await grant('letter');
    const state = await harness.state();
    expect(perceivedEntityIds(state, 'hero').has('letter')).toBe(true);
    expect(perceivedEntityIds(state, 'friend').has('letter')).toBe(false);
    expectAccepted(await act({ type: 'DropItem', itemId: 'letter' }));
    expect(perceivedEntityIds(await harness.state(), 'friend').has('letter')).toBe(true);
  });
});

describe('during an encounter', () => {
  it('holds back picking up for a combatant, and a combatant off its turn; not someone outside', async () => {
    await grant('letter');
    const state = await harness.state();
    const fighting = {
      ...state,
      encounter: { currentIndex: 0, combatants: [{ entityId: 'friend' }, { entityId: 'hero' }] },
    } as unknown as typeof state;
    const drop = { type: 'DropItem', characterId: 'hero', itemId: 'letter' } as never;
    expect(decideDropItem(fighting, drop)).toMatchObject({
      ok: false,
      rejection: { code: 'ILLEGAL_ACTION', message: 'NOT_YOUR_TURN' },
    });
    const take = { type: 'TakeItem', characterId: 'hero', itemId: 'letter' } as never;
    expect(decideTakeItem(fighting, take)).toMatchObject({
      ok: false,
      rejection: { code: 'COMBAT_ALREADY_ACTIVE' },
    });
    const other = {
      ...fighting,
      encounter: { currentIndex: 0, combatants: [{ entityId: 'friend' }, { entityId: 'far' }] },
    } as never;
    expect(decideDropItem(other, drop).ok).toBe(true);
  });
});

describe('undo safety', () => {
  it('will not undo a grant beneath a standing equip, or a drop beneath a pickup', async () => {
    const granted = await grant('cloak', 'caravan-cloak');
    expectAccepted(await act({ type: 'EquipItem', itemId: 'cloak', slot: 'cloak' }));
    expectRejected(
      await harness.submit({ type: 'UndoCommand', targetCommandId: granted.commandId }),
      'UNDO_UNSAFE',
    );

    await grant('letter');
    const dropped = expectAccepted(await act({ type: 'DropItem', itemId: 'letter' }));
    expectAccepted(await act({ type: 'TakeItem', itemId: 'letter' }));
    expectRejected(
      await harness.submit({ type: 'UndoCommand', targetCommandId: dropped.commandId }),
      'UNDO_UNSAFE',
    );
    await verified();
  });

  it('keeps every effective command re-decidable after undoing the last ones', async () => {
    await grant('mail', 'watchman-mail');
    const worn = expectAccepted(await act({ type: 'EquipItem', itemId: 'mail', slot: 'body' }));
    await grant('letter');
    expectAccepted(await act({ type: 'GiveItem', itemId: 'letter', toHolderId: 'friend' }));
    expectAccepted(await harness.submit({ type: 'UndoCommand', targetCommandId: worn.commandId }));
    const snapshot = await harness.snapshot();
    const log = await harness.engine.commandLog('test-campaign');
    expect(redecideEffective(log, snapshot, () => 0)).toBeNull();
  });
});

describe('concurrent handling', () => {
  it('lets only one of two simultaneous hand-overs of the same item succeed', async () => {
    await grant('letter');
    expectAccepted(
      await harness.submit({ type: 'PlaceEntity', entityId: 'far', locationId: 'square' }),
    );
    const results = await Promise.all(
      ['friend', 'far'].map((toHolderId) =>
        act({ type: 'GiveItem', itemId: 'letter', toHolderId }),
      ),
    );
    expect(results.filter((result) => result.status === 'accepted')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    const state = await verified();
    expect(['friend', 'far']).toContain(possessionOf(state, 'letter')?.holderId);
  });

  it('never duplicates a stack by dropping and taking it at once', async () => {
    await grant('balm', 'woodland-balm', 2);
    await Promise.all([
      act({ type: 'DropItem', itemId: 'balm' }),
      act({ type: 'DropItem', itemId: 'balm' }),
    ]);
    const state = await verified();
    expect(possessionOf(state, 'balm')?.quantity).toBe(2);
  });
});

describe('refusals confirm nothing', () => {
  it('answers alike for what exists elsewhere, is carried by another, or does not exist', async () => {
    await grant('letter');
    const codes = async (commands: Record<string, unknown>[]) =>
      (await Promise.all(commands.map((c) => act(c)))).map((r) =>
        r.status === 'rejected' ? r.code : 'accepted',
      );
    expect(
      await codes([
        { type: 'GiveItem', itemId: 'letter', toHolderId: 'far' },
        { type: 'GiveItem', itemId: 'letter', toHolderId: 'no-such-person' },
      ]),
    ).toEqual(['NOT_PRESENT', 'NOT_PRESENT']);
    expect(
      await codes([
        { type: 'TakeItem', itemId: 'no-such-item' },
        { type: 'TakeItem', itemId: 'letter' },
        { type: 'TakeItem', itemId: 'far' },
      ]),
    ).toEqual(['NOT_PRESENT', 'NOT_PRESENT', 'NOT_PRESENT']);
    expect(
      await codes([
        { type: 'EquipItem', itemId: 'mail', slot: 'body' },
        { type: 'EquipItem', itemId: 'no-such-item', slot: 'body' },
        { type: 'UseItem', itemId: 'far' },
      ]),
    ).toEqual(['INVALID_ITEM', 'INVALID_ITEM', 'INVALID_ITEM']);
  });
});

describe('standing beside', () => {
  it('counts squares, diagonals as one', () => {
    const at = (entityId: string, x: number, y: number) => ({ entityId, position: { x, y } });
    const state = {
      encounter: { combatants: [at('a', 2, 2), at('b', 3, 3), at('c', 5, 2), at('d', 2, 4)] },
    } as never;
    expect(adjacentInEncounter(state, 'a', 'b')).toBe(true);
    expect(adjacentInEncounter(state, 'a', 'c')).toBe(false);
    expect(adjacentInEncounter(state, 'a', 'd')).toBe(false);
    expect(adjacentInEncounter(state, 'a', 'nobody')).toBe(false);
  });
});

describe('part of a stack', () => {
  it('hands over some units as an item of their own and keeps the rest', async () => {
    await grant('balm', 'woodland-balm', 3);
    const given = expectAccepted(
      await act({ type: 'GiveItem', itemId: 'balm', toHolderId: 'friend', quantity: 1 }),
    );
    const state = await verified();
    expect(possessionOf(state, 'balm')).toMatchObject({ holderId: 'hero', quantity: 2 });
    const moved = [...state.possessions].find(
      ([id, p]) => id !== 'balm' && p.holderId === 'friend',
    );
    expect(moved?.[1]).toMatchObject({ catalogId: 'woodland-balm', quantity: 1 });
    expect(state.entities.get(moved?.[0] ?? '')?.name).toBe('balm');
    // Undo puts every unit back under the one stack.
    expectAccepted(await harness.submit({ type: 'UndoCommand', targetCommandId: given.commandId }));
    const back = await verified();
    expect(possessionOf(back, 'balm')?.quantity).toBe(3);
    expect(moved && possessionOf(back, moved[0])).toBeUndefined();
  });

  it('drops part of a stack where the character stands, and refuses impossible portions', async () => {
    await grant('balm', 'woodland-balm', 3);
    await grant('cloak', 'caravan-cloak');
    expectRejected(await act({ type: 'DropItem', itemId: 'balm', quantity: 4 }), 'INVALID_ITEM');
    expectAccepted(await act({ type: 'DropItem', itemId: 'balm', quantity: 2 }));
    const state = await verified();
    expect(possessionOf(state, 'balm')?.quantity).toBe(1);
    const ground = [...state.possessions].find(([, p]) => p.holderId === null);
    expect(ground?.[1].quantity).toBe(2);
    expect(state.entities.get(ground?.[0] ?? '')?.placement?.locationId).toBe('square');
  });

  it('conserves the total when the same stack is divided twice at once', async () => {
    await grant('balm', 'woodland-balm', 3);
    await Promise.all(
      [2, 2].map((quantity) =>
        act({ type: 'GiveItem', itemId: 'balm', toHolderId: 'friend', quantity }),
      ),
    );
    const state = await verified();
    const total = [...state.possessions.values()].reduce((sum, p) => sum + p.quantity, 0);
    expect(total).toBe(3);
  });
});
