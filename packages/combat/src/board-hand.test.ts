import type { CommandResult } from '@ltw/contracts';
import { describe, expect, it } from 'vitest';

import {
  ELOWEN,
  PLAYER,
  RAIDER_1,
  RAIDER_2,
  codeOf,
  roadWorld,
  startAmbush,
} from './testing/road.ts';
import { verifyHistory } from './testing/verify.ts';

/**
 * The DM's hand on the board (docs/adr/0057-encounters-maps-loot.md §2): any combatant set down on
 * a free square at any time, no movement spent and no opportunity attack; the field's edge, walls
 * and others refuse it; a player may not; set down out of a grapple's reach, it is held no longer.
 */
const WORG = 'creature-77c0f1a2';
const reasonOf = (result: CommandResult) =>
  result.status === 'rejected' ? result.message : result.status;

describe('the DM sets a combatant down', () => {
  it('on a free square, out of its turn, its movement untouched', async () => {
    const world = await roadWorld();
    await startAmbush(world);
    const before = (await world.encounter()).combatants.find((one) => one.entityId === RAIDER_1);
    const place = (position: { x: number; y: number }, combatantId = RAIDER_1) =>
      world.dm({ type: 'PlaceCombatant', combatantId, position });
    expect(codeOf(await place({ x: 3, y: 6 }))).toBe('accepted');
    const after = (await world.encounter()).combatants.find((one) => one.entityId === RAIDER_1);
    expect(after?.position).toEqual({ x: 3, y: 6 });
    expect(after?.turn).toEqual(before?.turn);
    // Its own square again changes nothing; the edge, another's square and a player are refused.
    expect(codeOf(await place({ x: 3, y: 6 }))).toBe('NO_EFFECT');
    expect(reasonOf(await place({ x: 20, y: 2 }))).toBe(
      'A combatant stands outside the battlefield',
    );
    const r2 = (await world.encounter()).combatants.find((one) => one.entityId === RAIDER_2);
    if (!r2) throw new Error('no raider');
    expect(reasonOf(await place(r2.position))).toBe('Two combatants cannot share a square');
    const player = await world.submit(
      { type: 'PlaceCombatant', combatantId: ELOWEN, position: { x: 2, y: 2 } },
      PLAYER,
    );
    expect(codeOf(player)).toBe('FORBIDDEN');
    await verifyHistory(world);
  });

  it('carries a rider with its mount, and leaves a rider on it', async () => {
    const world = await roadWorld();
    await startAmbush(world);
    const block = (await world.state()).statBlocks.get(RAIDER_1);
    if (!block) throw new Error('no block');
    await world.dm({
      type: 'CreateEntity',
      entityId: WORG,
      kind: 'creature',
      name: 'Grey Worg',
      existsSince: null,
      placement: { locationId: 'old-trade-road', since: null },
    });
    await world.dm({
      type: 'SetStatBlock',
      entityId: WORG,
      statBlock: { ...block, size: 'large' },
    });
    await world.dm({
      type: 'AddCombatant',
      entityId: WORG,
      side: 'party',
      position: { x: 3, y: 6 },
      initiative: 12,
    });
    await world.dm({ type: 'CommandCreature', combatantId: WORG, characterId: ELOWEN });
    const mounted = await world.submit(
      { type: 'TakeAction', combatantId: ELOWEN, action: 'mount', targetId: WORG },
      PLAYER,
    );
    expect(codeOf(mounted)).toBe('accepted');
    // The Large worg fills (5, 1)–(6, 2) and Elowen rides along; she alone cannot be lifted off.
    expect(
      codeOf(
        await world.dm({ type: 'PlaceCombatant', combatantId: WORG, position: { x: 5, y: 1 } }),
      ),
    ).toBe('accepted');
    const combatants = (await world.encounter()).combatants;
    expect(combatants.find((one) => one.entityId === ELOWEN)).toMatchObject({
      mountedOn: WORG,
      position: { x: 5, y: 1 },
    });
    const rider = await world.dm({
      type: 'PlaceCombatant',
      combatantId: ELOWEN,
      position: { x: 0, y: 0 },
    });
    expect(reasonOf(rider)).toBe('MOUNTED');
    await verifyHistory(world);
  });

  it('frees a creature set down out of its grappler’s reach', async () => {
    const world = await roadWorld();
    await startAmbush(world, undefined, (command) => ({
      ...command,
      combatants: command.combatants.map((c) =>
        c.entityId === RAIDER_1 ? { ...c, position: { x: 3, y: 6 } } : c,
      ),
    }));
    // Elowen's Unarmed Strike grapples Raider 1 beside her: its Dexterity save fails.
    world.roll(20, 5);
    const grabbed = await world.submit(
      {
        type: 'Attack',
        combatantId: ELOWEN,
        attackId: 'unarmed-strike',
        targetId: RAIDER_1,
        unarmed: 'grapple',
      },
      PLAYER,
    );
    expect(grabbed.status === 'accepted' && grabbed.outcome).toMatchObject({ saved: false });
    const held = async () => (await world.state()).statBlocks.get(RAIDER_1)?.conditions ?? [];
    expect(await held()).toContain('grappled');
    // A square away it stays held; across the road it is free.
    expect(
      codeOf(
        await world.dm({ type: 'PlaceCombatant', combatantId: RAIDER_1, position: { x: 3, y: 7 } }),
      ),
    ).toBe('accepted');
    expect(await held()).toContain('grappled');
    expect(
      codeOf(
        await world.dm({ type: 'PlaceCombatant', combatantId: RAIDER_1, position: { x: 9, y: 2 } }),
      ),
    ).toBe('accepted');
    expect(await held()).not.toContain('grappled');
    const raider = (await world.encounter()).combatants.find((one) => one.entityId === RAIDER_1);
    expect(raider?.conditionDetails ?? []).toEqual([]);
    await verifyHistory(world);
  });
});
