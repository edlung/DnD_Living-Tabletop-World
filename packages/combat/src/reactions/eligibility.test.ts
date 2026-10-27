import { describe, expect, it } from 'vitest';

import { addSeren, cast, counterspell, SEREN, withSeren } from '../testing/reactions.ts';
import type { AMBUSH } from '../testing/road.ts';
import {
  ELOWEN,
  RAIDER_1,
  SHAMAN,
  codeOf,
  openWindowId,
  recorded,
  roadWorld,
  startAmbush,
  type RoadWorld,
} from '../testing/road.ts';

/**
 * Deterministic eligibility (docs/adr/0016-reaction-engine.md §1): a window
 * opens only when the Rules accept someone's Counterspell right now.
 */
type Start = typeof AMBUSH.startCombat;
const opens = async (world: RoadWorld, result: Awaited<ReturnType<RoadWorld['dm']>>) =>
  (await recorded(world, result)).some((e) => e.type === 'ReactionWindowOpened');
const shamanAt =
  (x: number, y: number, width = 16) =>
  (command: Start): Record<string, unknown> => ({
    ...command,
    battlefield: { ...command.battlefield, width },
    combatants: command.combatants.map((c) =>
      c.entityId === SHAMAN ? { ...c, position: { x, y } } : c,
    ),
  });
const boltAtElowen = cast(SHAMAN, 'ashen-bolt', { targetId: ELOWEN });

async function shamanTurn(world: RoadWorld) {
  await world.dm({ type: 'EndTurn', combatantId: ELOWEN });
}

describe('who can counter', () => {
  it('nobody beyond 60 ft: the spell resolves at once', async () => {
    const world = await roadWorld();
    await startAmbush(world, undefined, shamanAt(15, 6, 20));
    await shamanTurn(world);
    expect(await opens(world, await world.dm(boltAtElowen))).toBe(false);
  });

  it('nobody without a slot of level 3 or higher', async () => {
    const world = await roadWorld();
    const sheet = (await world.state()).characterSheets.get(ELOWEN);
    if (!sheet) throw new Error('no sheet');
    await world.dm({
      type: 'SetCharacterSheet',
      entityId: ELOWEN,
      sheet: {
        ...sheet,
        spellSlots: { ...sheet.spellSlots, expended: [0, 0, 3, 3, 2, 1, 0, 0, 0] },
      },
    });
    await startAmbush(world);
    await shamanTurn(world);
    expect(await opens(world, await world.dm(boltAtElowen))).toBe(false);
  });

  it('nobody who cannot see the caster (total cover)', async () => {
    const world = await roadWorld();
    await startAmbush(world, undefined, shamanAt(3, 2));
    await shamanTurn(world);
    expect(await opens(world, await world.dm(boltAtElowen))).toBe(false);
  });

  it('nobody Unconscious', async () => {
    const world = await roadWorld();
    const sheet = (await world.state()).characterSheets.get(ELOWEN);
    if (!sheet) throw new Error('no sheet');
    await world.dm({
      type: 'SetCharacterSheet',
      entityId: ELOWEN,
      sheet: { ...sheet, hitPoints: { max: 78, current: 1 } },
    });
    // Raider 1 strikes first (initiative), next to Elowen.
    await startAmbush(world, [10, 19, 2, 1, 11], (command: Start) => ({
      ...command,
      combatants: command.combatants.map((c) =>
        c.entityId === RAIDER_1 ? { ...c, position: { x: 3, y: 6 } } : c,
      ),
    }));
    world.roll(20, 15);
    expect(
      codeOf(
        await world.dm({
          type: 'Attack',
          combatantId: RAIDER_1,
          attackId: 'scimitar',
          targetId: ELOWEN,
        }),
      ),
    ).toBe('accepted');
    expect((await world.state()).characterSheets.get(ELOWEN)?.conditions).toContain('unconscious');
    // Order: Raider 1 (21), Elowen (14), Shaman (13), Raiders 2 and 3.
    await world.dm({ type: 'EndTurn', combatantId: RAIDER_1 });
    await world.dm({ type: 'EndTurn', combatantId: ELOWEN });
    expect(await opens(world, await world.dm(boltAtElowen))).toBe(false);
  });

  it('nobody whose Reaction is spent, until it returns at the start of their turn', async () => {
    const world = await roadWorld();
    const block = (await world.state()).statBlocks.get(SHAMAN);
    await world.dm({
      type: 'CreateEntity',
      entityId: 'goblin-shaman-2',
      kind: 'creature',
      name: 'Goblin Shaman',
      existsSince: null,
    });
    await world.dm({ type: 'SetStatBlock', entityId: 'goblin-shaman-2', statBlock: block });
    await world.dm({
      type: 'PlaceEntity',
      entityId: 'goblin-shaman-2',
      locationId: 'old-trade-road',
    });
    // Elowen 21, Shaman 17, second Shaman 16, then the Raiders.
    await startAmbush(world, [17, 3, 2, 1, 15, 14], (command: Start) => ({
      ...command,
      combatants: [
        ...command.combatants,
        { entityId: 'goblin-shaman-2', side: 'hostile', position: { x: 12, y: 8 } },
      ],
    }));
    await shamanTurn(world);
    await world.dm(boltAtElowen);
    world.roll(20, 5);
    expect(codeOf(await world.submit(counterspell(ELOWEN, await openWindowId(world))))).toBe(
      'accepted',
    );
    await world.dm({ type: 'EndTurn', combatantId: SHAMAN });
    const second = await world.dm(cast('goblin-shaman-2', 'ashen-bolt', { targetId: ELOWEN }));
    expect(await opens(world, second)).toBe(false);
    for (const id of [
      'goblin-shaman-2',
      RAIDER_1,
      'creature-589f6668',
      'creature-6513bec0',
      ELOWEN,
    ]) {
      expect(codeOf(await world.dm({ type: 'EndTurn', combatantId: id }))).toBe('accepted');
    }
    expect(await opens(world, await world.dm(boltAtElowen))).toBe(true);
  });

  it('every eligible character, in initiative order; the dead are not', async () => {
    const world = await roadWorld();
    await addSeren(world);
    await startAmbush(world, [17, 3, 2, 1, 15, 5], withSeren());
    await shamanTurn(world);
    await world.dm(boltAtElowen);
    const window = (await world.state()).reactionWindows.get(await openWindowId(world));
    expect(window?.candidates.map((c) => c.entityId)).toEqual([ELOWEN, SEREN]);

    const other = await roadWorld();
    await addSeren(other);
    await startAmbush(other, [17, 3, 2, 1, 15, 5], withSeren());
    await other.dm({ type: 'ChangeEntityStatus', entityId: SEREN, status: 'dead' });
    await shamanTurn(other);
    await other.dm(boltAtElowen);
    const only = (await other.state()).reactionWindows.get(await openWindowId(other));
    expect(only?.candidates.map((c) => c.entityId)).toEqual([ELOWEN]);
    expect(only?.ineligible).toContainEqual({ entityId: SEREN, reason: 'ACTOR_DEAD' });
  });
});
