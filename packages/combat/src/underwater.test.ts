import type { Speeds, Square } from '@ltw/contracts';
import { describe, expect, it } from 'vitest';

import {
  ELOWEN,
  PLAYER,
  RAIDER_1,
  RAIDER_2,
  SHAMAN,
  codeOf,
  recorded,
  roadWorld,
  startAmbush,
  type RoadWorld,
} from './testing/road.ts';

/**
 * Underwater combat (SRD 5.2.1; docs/adr/0049-space-and-movement.md §11) on the Old Trade Road,
 * widened to 30 squares: Elowen at (2, 6) with a shortsword, Raider 1 beside her at (3, 6), both in
 * deep water unless a test says otherwise; Raider 2 far off at (25, 6), 115 ft away. Elowen acts
 * first, then the Shaman, then the raiders (scimitar +4, shortbow 80/320).
 */
interface Pool {
  readonly deep?: readonly Square[];
  readonly raiderSpeeds?: Speeds;
}

async function pool({
  deep = [
    { x: 2, y: 6 },
    { x: 3, y: 6 },
  ],
  raiderSpeeds,
}: Pool = {}): Promise<RoadWorld> {
  const world = await roadWorld();
  const state = await world.state();
  const sheet = state.characterSheets.get(ELOWEN);
  if (!sheet) throw new Error('no sheet');
  await world.dm({
    type: 'SetCharacterSheet',
    entityId: ELOWEN,
    sheet: { ...sheet, weapons: ['longbow', 'shortsword'] },
  });
  if (raiderSpeeds) {
    const block = state.statBlocks.get(RAIDER_1);
    if (!block) throw new Error('no block');
    await world.dm({
      type: 'SetStatBlock',
      entityId: RAIDER_1,
      statBlock: { ...block, speeds: raiderSpeeds },
    });
  }
  const started = await startAmbush(world, undefined, (command) => ({
    ...command,
    battlefield: {
      ...command.battlefield,
      width: 30,
      water: deep.map((square) => ({ ...square, deep: true as const })),
    },
    combatants: command.combatants.map((c) =>
      c.entityId === RAIDER_1
        ? { ...c, position: { x: 3, y: 6 } }
        : c.entityId === RAIDER_2
          ? { ...c, position: { x: 25, y: 6 } }
          : c,
    ),
  }));
  expect(codeOf(started)).toBe('accepted');
  return world;
}

/** On to the raiders' turns: Elowen and the Shaman end theirs. */
async function toRaiders(world: RoadWorld) {
  await world.submit({ type: 'EndTurn', combatantId: ELOWEN }, PLAYER);
  await world.dm({ type: 'EndTurn', combatantId: SHAMAN });
}
const performed = async (world: RoadWorld, result: Awaited<ReturnType<RoadWorld['submit']>>) =>
  (await recorded(world, result)).find((e) => e.type === 'AttackPerformed')?.payload;
const reasonOf = (result: Awaited<ReturnType<RoadWorld['submit']>>) =>
  result.status === 'rejected' ? result.message : result.status;

describe('weapons under water', () => {
  it('a scimitar drags without a Swim Speed, and not with one', async () => {
    const world = await pool();
    await toRaiders(world);
    world.roll(20, 15, 5);
    const slashed = await world.dm({
      type: 'Attack',
      combatantId: RAIDER_1,
      attackId: 'scimitar',
      targetId: ELOWEN,
    });
    expect(await performed(world, slashed)).toMatchObject({ disadvantage: true });

    const swimmer = await pool({ raiderSpeeds: { swim: 30 } });
    await toRaiders(swimmer);
    swimmer.roll(20, 15);
    const free = await swimmer.dm({
      type: 'Attack',
      combatantId: RAIDER_1,
      attackId: 'scimitar',
      targetId: ELOWEN,
    });
    expect(await performed(swimmer, free)).toMatchObject({ disadvantage: false });
  });

  it('her shortsword stabs freely under water', async () => {
    const world = await pool();
    world.roll(20, 12);
    const stabbed = await world.submit(
      { type: 'Attack', combatantId: ELOWEN, attackId: 'shortsword', targetId: RAIDER_1 },
      PLAYER,
    );
    expect(await performed(world, stabbed)).toMatchObject({ disadvantage: false });
  });

  it('a shot into the water reaches its normal range only, and drags within it', async () => {
    // Raider 2's shortbow at Elowen 115 ft off: beyond 80 ft, under water it cannot reach her.
    const wet = await pool();
    await toRaiders(wet);
    await wet.dm({ type: 'EndTurn', combatantId: RAIDER_1 });
    const far = await wet.dm({
      type: 'Attack',
      combatantId: RAIDER_2,
      attackId: 'shortbow',
      targetId: ELOWEN,
    });
    expect(reasonOf(far)).toBe('OUT_OF_RANGE');
    // On dry ground the same shot is a long one.
    const dry = await pool({ deep: [] });
    await toRaiders(dry);
    await dry.dm({ type: 'EndTurn', combatantId: RAIDER_1 });
    dry.roll(20, 15, 5);
    const long = await dry.dm({
      type: 'Attack',
      combatantId: RAIDER_2,
      attackId: 'shortbow',
      targetId: ELOWEN,
    });
    expect(await performed(dry, long)).toMatchObject({ disadvantage: true });
  });
});

describe('fire under water', () => {
  it('is resisted by the fully immersed', async () => {
    const world = await pool();
    const hpOf = async () =>
      (await world.state()).statBlocks.get(RAIDER_1)?.hitPoints.current ?? Number.NaN;
    const before = await hpOf();
    const burned = await world.dm({
      type: 'AdjustHitPoints',
      targetId: RAIDER_1,
      change: 'damage',
      amount: 10,
      damageType: 'fire',
      reason: 'A test of the rules',
    });
    expect(codeOf(burned)).toBe('accepted');
    expect(await hpOf()).toBe(before - 5);
  });
});
