import type { CreatureSize, Square } from '@ltw/contracts';
import { describe, expect, it } from 'vitest';

import { gapBetween } from './battlefield.ts';
import {
  ELOWEN,
  PLAYER,
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
import { verifyHistory } from './testing/verify.ts';

/**
 * Size and space (docs/adr/0049-space-and-movement.md §1–4) on the Old Trade Road: Elowen at
 * (2, 6) acts first, then the Shaman (12, 6), then Raiders 1–3 at (8, 4), (10, 7), (11, 5).
 * Half cover lies at (7–9, 4); the row y = 9 is difficult.
 */
interface Field {
  readonly sizes?: Readonly<Record<string, CreatureSize>>;
  readonly at?: Readonly<Record<string, Square>>;
  readonly walls?: readonly Square[];
}

async function field({ sizes = {}, at = {}, walls }: Field = {}): Promise<RoadWorld> {
  const world = await roadWorld();
  for (const [id, size] of Object.entries(sizes)) {
    const block = (await world.state()).statBlocks.get(id);
    if (!block) throw new Error('no block');
    const set = await world.dm({
      type: 'SetStatBlock',
      entityId: id,
      statBlock: { ...block, size },
    });
    expect(codeOf(set)).toBe('accepted');
  }
  const started = await startAmbush(world, undefined, (command) => ({
    ...command,
    battlefield: { ...command.battlefield, ...(walls ? { walls } : {}) },
    combatants: command.combatants.map((c) => {
      const square = at[c.entityId];
      return square ? { ...c, position: square } : c;
    }),
  }));
  expect(codeOf(started)).toBe('accepted');
  return world;
}

const record = async (world: RoadWorld, id: string) => {
  const found = (await world.encounter()).combatants.find((c) => c.entityId === id);
  if (!found) throw new Error('no combatant');
  return found;
};
const move = (world: RoadWorld, id: string, path: readonly Square[]) =>
  world.dm({ type: 'MoveCombatant', combatantId: id, path });
const reasonOf = (result: Awaited<ReturnType<RoadWorld['submit']>>) =>
  result.status === 'rejected' ? result.message : result.status;
/** Elowen's turn ends; the Shaman's starts. */
const toShaman = (world: RoadWorld) =>
  world.submit({ type: 'EndTurn', combatantId: ELOWEN }, PLAYER);

describe('size and space', () => {
  it('a Large creature fills four squares, and distances run from its nearest one', async () => {
    const world = await field({ sizes: { [RAIDER_2]: 'large' } });
    const state = await world.state();
    // From (2, 6) to the space (10–11, 7–8): eight squares.
    expect(gapBetween(state, await record(world, ELOWEN), await record(world, RAIDER_2))).toBe(40);
    await toShaman(world);
    // Its space ends no move of another, even an ally's.
    expect(reasonOf(await move(world, SHAMAN, [{ x: 11, y: 7 }]))).toBe('INVALID_PATH');
    expect(reasonOf(await move(world, SHAMAN, [{ x: 11, y: 8 }]))).toBe('INVALID_PATH');
    await verifyHistory(world);
  });

  it('a fight refuses a space off the field, on a wall or on another’s space', async () => {
    const world = await roadWorld();
    const block = (await world.state()).statBlocks.get(RAIDER_2);
    if (!block) throw new Error('no block');
    await world.dm({
      type: 'SetStatBlock',
      entityId: RAIDER_2,
      statBlock: { ...block, size: 'huge' },
    });
    // A Huge raider at (14, 7) would reach x = 16, beyond the 16 squares.
    const off = await startAmbush(world, undefined, (command) => ({
      ...command,
      combatants: command.combatants.map((c) =>
        c.entityId === RAIDER_2 ? { ...c, position: { x: 14, y: 7 } } : c,
      ),
    }));
    expect(reasonOf(off)).toBe('A combatant stands outside the battlefield');
    // At (10, 4) its space would take Raider 3's square (11, 5).
    const shared = await world.dm({
      type: 'StartCombat',
      locationId: 'old-trade-road',
      battlefield: { width: 16, height: 12, difficult: [], cover: [] },
      combatants: [
        { entityId: ELOWEN, side: 'party', position: { x: 2, y: 6 } },
        { entityId: RAIDER_2, side: 'hostile', position: { x: 10, y: 4 } },
        { entityId: RAIDER_3, side: 'hostile', position: { x: 11, y: 5 } },
      ],
    });
    expect(reasonOf(shared)).toBe('Two combatants cannot share a square');
  });
});

describe('moving around creatures and walls', () => {
  it('passes through an ally’s space as Difficult Terrain, never through a foe’s', async () => {
    const world = await field({ at: { [SHAMAN]: { x: 9, y: 6 } } });
    await toShaman(world);
    // Through Raider 2 at (10, 7): 10 ft into its space, 5 ft beyond.
    expect(
      codeOf(
        await move(world, SHAMAN, [
          { x: 10, y: 7 },
          { x: 11, y: 8 },
        ]),
      ),
    ).toBe('accepted');
    expect((await record(world, SHAMAN)).turn.movementUsedFt).toBe(15);
    expect((await record(world, SHAMAN)).position).toEqual({ x: 11, y: 8 });
  });

  it('a Tiny creature’s space is passed, a foe two sizes apart too; walls are not', async () => {
    const world = await field({
      sizes: { [RAIDER_1]: 'tiny' },
      at: { [RAIDER_1]: { x: 3, y: 6 } },
      walls: [
        { x: 3, y: 5 },
        { x: 3, y: 7 },
      ],
    });
    // Elowen walks east through the Tiny raider's square, between the walls.
    const walked = await world.submit({
      type: 'MoveCombatant',
      combatantId: ELOWEN,
      path: [
        { x: 3, y: 6 },
        { x: 4, y: 6 },
      ],
    });
    expect(codeOf(walked)).toBe('accepted');
    expect((await record(world, ELOWEN)).turn.movementUsedFt).toBe(15);
    const into = await world.submit({
      type: 'MoveCombatant',
      combatantId: ELOWEN,
      path: [{ x: 3, y: 5 }],
    });
    expect(reasonOf(into)).toBe('INVALID_PATH');
  });

  it('a Large creature squeezes through a corridor one square wide, and is easier to hit there', async () => {
    // Walls at x = 7 and x = 9 for y = 2–3 leave a corridor along x = 8.
    const walls = [2, 3].flatMap((y) => [
      { x: 7, y },
      { x: 9, y },
    ]);
    const world = await field({
      sizes: { [RAIDER_1]: 'large' },
      at: { [RAIDER_1]: { x: 7, y: 5 } },
      walls,
    });
    await toShaman(world);
    await world.dm({ type: 'EndTurn', combatantId: SHAMAN });
    // (8, 4) fits it whole; (8, 3) and (8, 2) only squeezed: 5 + 10 + 10.
    const squeezed = await move(world, RAIDER_1, [
      { x: 8, y: 4 },
      { x: 8, y: 3 },
      { x: 8, y: 2 },
    ]);
    expect(codeOf(squeezed)).toBe('accepted');
    expect(await record(world, RAIDER_1)).toMatchObject({
      position: { x: 8, y: 2 },
      squeezed: true,
      turn: { movementUsedFt: 25 },
    });
    for (const id of [RAIDER_1, RAIDER_2, RAIDER_3]) {
      await world.dm({ type: 'EndTurn', combatantId: id });
    }
    world.roll(20, 5, 15);
    world.roll(8, 4);
    const shot = await world.submit({
      type: 'Attack',
      combatantId: ELOWEN,
      attackId: 'longbow',
      targetId: RAIDER_1,
    });
    const attack = (await recorded(world, shot)).find((e) => e.type === 'AttackPerformed');
    expect(attack?.payload).toMatchObject({ advantage: true, rolls: [5, 15] });
    await verifyHistory(world);
  });
});

describe('size and the rules that move or hold', () => {
  it('a grapple holds no creature more than one size larger', async () => {
    const huge = await field({ sizes: { [RAIDER_1]: 'huge' }, at: { [RAIDER_1]: { x: 3, y: 6 } } });
    const refused = await huge.submit({
      type: 'Attack',
      combatantId: ELOWEN,
      attackId: 'unarmed-strike',
      targetId: RAIDER_1,
      unarmed: 'grapple',
    });
    expect(reasonOf(refused)).toBe('TOO_LARGE');

    const large = await field({
      sizes: { [RAIDER_1]: 'large' },
      at: { [RAIDER_1]: { x: 3, y: 6 } },
    });
    const tried = await large.submit({
      type: 'Attack',
      combatantId: ELOWEN,
      attackId: 'unarmed-strike',
      targetId: RAIDER_1,
      unarmed: 'grapple',
    });
    expect(codeOf(tried)).toBe('accepted');
  });

  it('a Fireball takes a Large creature when its sphere covers any of its squares', async () => {
    const world = await field({ sizes: { [RAIDER_2]: 'large' } });
    // From (15, 8), 20 ft reaches (11, 8) of the raider's space, not its square (10, 7).
    const cast = await world.submit({
      type: 'CastSpell',
      combatantId: ELOWEN,
      spellId: 'fireball',
      point: { x: 15, y: 8 },
    });
    expect(codeOf(cast)).toBe('accepted');
    const hit = (await recorded(world, cast)).filter((e) => e.type === 'DamageApplied');
    expect(hit.map((e) => (e.payload as { targetId: string }).targetId)).toContain(RAIDER_2);
  });
});
