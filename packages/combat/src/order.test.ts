import { describe, expect, it } from 'vitest';

import {
  ELOWEN,
  RAIDER_1,
  RAIDER_2,
  RAIDER_3,
  SHAMAN,
  codeOf,
  recorded,
  roadWorld,
  startAmbush,
  type RoadWorld,
} from './testing/road.ts';

/**
 * A running fight changed by the DM (docs/adr/0043-dm-screen.md §2). The ambush's order: Elowen
 * 21, the Shaman 17, Raiders 1–3 at 5, 4, 3; Elowen's turn.
 */
async function ambush(): Promise<RoadWorld> {
  const world = await roadWorld();
  await startAmbush(world);
  return world;
}

async function order(world: RoadWorld) {
  const encounter = await world.encounter();
  return {
    ids: encounter.combatants.map((c) => c.entityId),
    current: encounter.combatants[encounter.currentIndex]?.entityId,
    round: encounter.round,
  };
}

/** A grey worg at the road, with a raider's statistics. */
async function worg(world: RoadWorld): Promise<string> {
  const block = (await world.state()).statBlocks.get(RAIDER_1);
  const created = await world.dm({
    type: 'CreateEntity',
    entityId: 'creature-77c0f1a2',
    kind: 'creature',
    name: 'Grey Worg',
    existsSince: null,
    placement: { locationId: 'old-trade-road', since: null },
  });
  expect(codeOf(created)).toBe('accepted');
  expect(
    codeOf(
      await world.dm({ type: 'SetStatBlock', entityId: 'creature-77c0f1a2', statBlock: block }),
    ),
  ).toBe('accepted');
  return 'creature-77c0f1a2';
}

describe('a delayed turn', () => {
  it('moves the combatant after another this round and passes the turn on', async () => {
    const world = await ambush();
    const delayed = await world.dm({ type: 'DelayTurn', combatantId: ELOWEN, afterId: RAIDER_1 });
    expect((await recorded(world, delayed)).map((event) => event.type)).toEqual([
      'CombatOrderChanged',
      'TurnStarted',
    ]);
    expect(await order(world)).toEqual({
      ids: [SHAMAN, RAIDER_1, ELOWEN, RAIDER_2, RAIDER_3],
      current: SHAMAN,
      round: 1,
    });
    const elowen = (await world.encounter()).combatants.find((c) => c.entityId === ELOWEN);
    expect(elowen?.initiative.total).toBe(5);
  });

  it('is refused once the turn began, before the current place, or for another', async () => {
    const world = await ambush();
    expect(
      codeOf(await world.dm({ type: 'DelayTurn', combatantId: SHAMAN, afterId: RAIDER_1 })),
    ).toBe('NOT_YOUR_TURN');
    await world.dm({ type: 'MoveCombatant', combatantId: ELOWEN, path: [{ x: 2, y: 5 }] });
    expect(
      codeOf(await world.dm({ type: 'DelayTurn', combatantId: ELOWEN, afterId: RAIDER_1 })),
    ).toBe('ILLEGAL_ACTION');
  });
});

describe('initiative set by the DM', () => {
  it('re-places the combatant by its total and keeps the current turn', async () => {
    const world = await ambush();
    expect(
      codeOf(await world.dm({ type: 'SetInitiative', combatantId: RAIDER_3, total: 25 })),
    ).toBe('accepted');
    expect(await order(world)).toEqual({
      ids: [RAIDER_3, ELOWEN, SHAMAN, RAIDER_1, RAIDER_2],
      current: ELOWEN,
      round: 1,
    });
    // The DM's total stands; the recorded roll and modifier stay.
    const raider = (await world.encounter()).combatants.find((c) => c.entityId === RAIDER_3);
    expect(raider?.initiative).toEqual({ roll: 1, modifier: 2, total: 25 });
    expect(
      codeOf(await world.dm({ type: 'SetInitiative', combatantId: RAIDER_3, total: 61 })),
    ).toBe('INVALID_COMMAND');
    expect(
      codeOf(await world.dm({ type: 'SetInitiative', combatantId: RAIDER_3, total: 25 })),
    ).toBe('NO_EFFECT');
  });
});

describe('combatants in and out', () => {
  it('removes one, and the current one passes the turn on', async () => {
    const world = await ambush();
    const reason = 'Fled into the woods';
    expect(codeOf(await world.dm({ type: 'RemoveCombatant', entityId: RAIDER_2, reason }))).toBe(
      'accepted',
    );
    expect((await order(world)).ids).toEqual([ELOWEN, SHAMAN, RAIDER_1, RAIDER_3]);
    const gone = await world.dm({ type: 'RemoveCombatant', entityId: ELOWEN, reason });
    expect((await recorded(world, gone)).map((event) => event.type)).toEqual([
      'CombatOrderChanged',
      'TurnStarted',
    ]);
    expect(await order(world)).toEqual({
      ids: [SHAMAN, RAIDER_1, RAIDER_3],
      current: SHAMAN,
      round: 1,
    });
    await world.dm({ type: 'RemoveCombatant', entityId: RAIDER_1, reason });
    expect(codeOf(await world.dm({ type: 'RemoveCombatant', entityId: RAIDER_3, reason }))).toBe(
      'INVALID_ENCOUNTER',
    );
  });

  it('adds a creature at the place by a named or a rolled initiative', async () => {
    const world = await ambush();
    const id = await worg(world);
    const add = { type: 'AddCombatant', entityId: id, side: 'hostile', position: { x: 9, y: 5 } };
    expect(codeOf(await world.dm({ ...add, initiative: 12 }))).toBe('accepted');
    expect(await order(world)).toMatchObject({
      ids: [ELOWEN, SHAMAN, id, RAIDER_1, RAIDER_2, RAIDER_3],
      current: ELOWEN,
    });
    expect(codeOf(await world.dm({ ...add, initiative: 12 }))).toBe('INVALID_ENCOUNTER');
    // Out again, then back with the die's roll.
    await world.dm({ type: 'RemoveCombatant', entityId: id, reason: 'Ran off' });
    world.roll(20, 20);
    expect(codeOf(await world.dm(add))).toBe('accepted');
    const joined = (await world.encounter()).combatants.find((c) => c.entityId === id);
    expect(joined?.initiative.roll).toBe(20);
    expect((await order(world)).ids[0]).toBe(id);
    // Nobody shares a square, and nobody joins from elsewhere.
    expect(
      codeOf(
        await world.dm({ ...add, entityId: 'mira-vale', position: { x: 0, y: 0 }, initiative: 10 }),
      ),
    ).toBe('INVALID_ENCOUNTER');
  });
});
