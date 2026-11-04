import type { PathStep, Speeds, Square } from '@ltw/contracts';
import { describe, expect, it } from 'vitest';

import { gapBetween } from './battlefield.ts';
import {
  ELOWEN,
  RAIDER_1,
  codeOf,
  recorded,
  roadWorld,
  startAmbush,
  type RoadWorld,
} from './testing/road.ts';
import { verifyHistory } from './testing/verify.ts';

/**
 * Speeds, terrain and height (docs/adr/0049-space-and-movement.md §5–9) on the Old Trade Road:
 * Elowen at (2, 6) acts first, then the Shaman (12, 6), then the raiders, Raider 1 at (8, 4) — or
 * at (3, 5) beside her when a test says so. Elowen: Speed 30, Strength 10 unless a test makes it 16.
 */
interface Terrain {
  readonly water?: readonly (Square & { deep?: true })[];
  readonly ground?: readonly (Square & { ft: number })[];
  readonly speeds?: Readonly<Record<string, Speeds>>;
  readonly strength?: number;
  readonly beside?: boolean;
}

async function road({
  water,
  ground,
  speeds = {},
  strength,
  beside = false,
}: Terrain = {}): Promise<RoadWorld> {
  const world = await roadWorld();
  const state = await world.state();
  const sheet = state.characterSheets.get(ELOWEN);
  if (!sheet) throw new Error('no sheet');
  const elowen = {
    ...sheet,
    ...(speeds[ELOWEN] ? { speeds: speeds[ELOWEN] } : {}),
    ...(strength === undefined ? {} : { abilities: { ...sheet.abilities, str: strength } }),
  };
  await world.dm({ type: 'SetCharacterSheet', entityId: ELOWEN, sheet: elowen });
  for (const [id, own] of Object.entries(speeds)) {
    if (id === ELOWEN) continue;
    const block = state.statBlocks.get(id);
    if (!block) throw new Error('no block');
    await world.dm({ type: 'SetStatBlock', entityId: id, statBlock: { ...block, speeds: own } });
  }
  const started = await startAmbush(world, undefined, (command) => ({
    ...command,
    battlefield: {
      ...command.battlefield,
      ...(water ? { water } : {}),
      ...(ground ? { ground } : {}),
    },
    combatants: command.combatants.map((c) =>
      beside && c.entityId === RAIDER_1 ? { ...c, position: { x: 3, y: 5 } } : c,
    ),
  }));
  expect(codeOf(started)).toBe('accepted');
  return world;
}

const record = async (world: RoadWorld, id: string) => {
  const found = (await world.encounter()).combatants.find((c) => c.entityId === id);
  if (!found) throw new Error('no combatant');
  return found;
};
const walk = (world: RoadWorld, path: readonly PathStep[], more: Record<string, unknown> = {}) =>
  world.submit({ type: 'MoveCombatant', combatantId: ELOWEN, path, ...more });
const reasonOf = (result: Awaited<ReturnType<RoadWorld['submit']>>) =>
  result.status === 'rejected' ? result.message : result.status;
const used = async (world: RoadWorld) => (await record(world, ELOWEN)).turn.movementUsedFt;

describe('water and climbing', () => {
  it('swims at an extra foot per foot without a Swim Speed, and at its own speed with one', async () => {
    const water = [{ x: 3, y: 6 }];
    const dry = await road({ water });
    expect(codeOf(await walk(dry, [{ x: 3, y: 6 }]))).toBe('accepted');
    expect(await used(dry)).toBe(10);
    const swimmer = await road({ water, speeds: { [ELOWEN]: { swim: 30 } } });
    await walk(swimmer, [{ x: 3, y: 6 }]);
    expect(await used(swimmer)).toBe(5);
  });

  it('climbs a ledge 10 ft high at 2 ft a foot, and stands there out of a sword’s reach', async () => {
    const ground = [{ x: 3, y: 6, ft: 10 }];
    const world = await road({ ground });
    expect(codeOf(await walk(world, [{ x: 3, y: 6 }]))).toBe('accepted');
    // 5 across and 10 up at double cost.
    expect(await used(world)).toBe(25);
    const climber = await road({ ground, speeds: { [ELOWEN]: { climb: 30 } } });
    await walk(climber, [{ x: 3, y: 6 }]);
    expect(await used(climber)).toBe(15);
  });

  it('climbs down a bank into a stream, paying for both', async () => {
    // She stands on a bank 10 ft above the water at (3, 6): 5 across, 10 down at 2, 5 swum more.
    const world = await road({ ground: [{ x: 2, y: 6, ft: 10 }], water: [{ x: 3, y: 6 }] });
    expect(codeOf(await walk(world, [{ x: 3, y: 6 }]))).toBe('accepted');
    expect(await used(world)).toBe(30);
  });

  it('crawls while Prone at an extra foot per foot, without standing up', async () => {
    const world = await road();
    await world.dm({
      type: 'SetCondition',
      targetId: ELOWEN,
      condition: 'prone',
      applied: true,
      reason: 'A test of the rules',
    });
    expect(codeOf(await walk(world, [{ x: 2, y: 7 }], { crawl: true }))).toBe('accepted');
    expect(await used(world)).toBe(10);
    const sheet = (await world.state()).characterSheets.get(ELOWEN);
    expect(sheet?.conditions).toContain('prone');
  });
});

describe('flying', () => {
  it('rises and moves through the air with a Fly Speed, out of a sword’s reach above', async () => {
    const world = await road({ speeds: { [ELOWEN]: { fly: 30 } } });
    // Raider 1 waits at (8, 4); she flies up 10 ft beside the Shaman's way.
    const rose = await walk(world, [
      { x: 2, y: 6, altitudeFt: 5 },
      { x: 2, y: 6, altitudeFt: 10 },
    ]);
    expect(codeOf(rose)).toBe('accepted');
    expect(await record(world, ELOWEN)).toMatchObject({ altitudeFt: 10 });
    expect(rose.status === 'accepted' ? rose.outcome : null).toMatchObject({ altitudeFt: 10 });
    // 10 ft up, a creature on the ground a square away is 10 ft from her: beyond a punch's reach.
    const state = await world.state();
    const elowen = await record(world, ELOWEN);
    const below = { ...(await record(world, RAIDER_1)), position: { x: 3, y: 6 } };
    expect(gapBetween(state, elowen, below)).toBe(10);
    await verifyHistory(world);
  });

  it('cannot leave the ground without a Fly Speed', async () => {
    const world = await road();
    expect(reasonOf(await walk(world, [{ x: 2, y: 6, altitudeFt: 5 }]))).toBe('NO_FLY_SPEED');
  });

  it('falls when made Prone, 1d6 a 10 ft, unless it hovers', async () => {
    const world = await road({ speeds: { [ELOWEN]: { fly: 30 } } });
    await walk(world, [
      { x: 2, y: 6, altitudeFt: 5 },
      { x: 2, y: 6, altitudeFt: 10 },
      { x: 2, y: 6, altitudeFt: 15 },
      { x: 2, y: 6, altitudeFt: 20 },
    ]);
    world.roll(6, 3, 4);
    const down = await world.dm({
      type: 'SetCondition',
      targetId: ELOWEN,
      condition: 'prone',
      applied: true,
      reason: 'A test of the rules',
    });
    expect(codeOf(down)).toBe('accepted');
    const fall = (await recorded(world, down)).find((e) => e.type === 'DamageApplied');
    expect(fall?.payload).toMatchObject({ fallFt: 20, rolls: [3, 4], amount: 7 });
    expect((await record(world, ELOWEN)).altitudeFt).toBeUndefined();

    const hovering = await road({ speeds: { [ELOWEN]: { fly: 30, hover: true } } });
    await hovering.submit({
      type: 'MoveCombatant',
      combatantId: ELOWEN,
      path: [{ x: 2, y: 6, altitudeFt: 5 }],
    });
    await hovering.dm({
      type: 'SetCondition',
      targetId: ELOWEN,
      condition: 'prone',
      applied: true,
      reason: 'A test of the rules',
    });
    expect((await record(hovering, ELOWEN)).altitudeFt).toBe(5);
  });
});

describe('jumping and falling', () => {
  // A pit 10 ft deep at (5, 6), two squares east of her.
  const pit = [{ x: 5, y: 6, ft: -10 }];

  it('long-jumps a pit after a 10-ft run-up, and not without one', async () => {
    const world = await road({ ground: pit, strength: 16 });
    const leapt = await walk(world, [
      { x: 3, y: 6 },
      { x: 4, y: 6 },
      { x: 5, y: 6, jump: true },
      { x: 6, y: 6, jump: true },
    ]);
    expect(codeOf(leapt)).toBe('accepted');
    expect((await record(world, ELOWEN)).position).toEqual({ x: 6, y: 6 });
    expect(await used(world)).toBe(20);

    // Standing at (4, 6) after one step, the jump is half: 8 ft, short of the 10 she needs.
    const short = await road({ ground: pit, strength: 16 });
    const fell = await walk(short, [
      { x: 3, y: 6 },
      { x: 4, y: 6, jump: true },
      { x: 5, y: 6, jump: true },
      { x: 6, y: 6, jump: true },
    ]);
    expect(reasonOf(fell)).toBe('JUMP_TOO_FAR');
  });

  it('drops into the pit instead of climbing down, and falls 10 ft', async () => {
    const world = await road({ ground: [{ x: 3, y: 6, ft: -10 }] });
    world.roll(6, 5);
    const dropped = await walk(world, [{ x: 3, y: 6, drop: true }]);
    expect(codeOf(dropped)).toBe('accepted');
    const fall = (await recorded(world, dropped)).find((e) => e.type === 'DamageApplied');
    expect(fall?.payload).toMatchObject({ fallFt: 10, rolls: [5], amount: 5 });
    const sheet = (await world.state()).characterSheets.get(ELOWEN);
    expect(sheet?.conditions).toContain('prone');
    // Her player is told the fall and the Prone it left.
    expect(dropped.status === 'accepted' ? dropped.outcome : null).toEqual({
      kind: 'MoveCombatant',
      position: { x: 3, y: 6 },
      fell: { feet: 10, damage: 5 },
      prone: true,
    });
    await verifyHistory(world);
  });

  it('a shove sends a creature off a ledge, and it falls', async () => {
    // Both stand on a ledge 10 ft high; the ground drops at x = 4.
    const ledge = [2, 3].flatMap((x) => [5, 6].map((y) => ({ x, y, ft: 10 })));
    // Raider 1 beside her at (3, 5): she shoves it away, north-east, off the ledge to (4, 4).
    const fresh = await road({ ground: ledge, strength: 16, beside: true });
    fresh.roll(20, 2);
    fresh.roll(6, 4);
    const shoved = await fresh.submit({
      type: 'Attack',
      combatantId: ELOWEN,
      attackId: 'unarmed-strike',
      targetId: RAIDER_1,
      unarmed: 'shove',
      shove: 'push',
    });
    expect(codeOf(shoved)).toBe('accepted');
    expect((await record(fresh, RAIDER_1)).position).toEqual({ x: 4, y: 4 });
    const fall = (await recorded(fresh, shoved)).find((e) => e.type === 'DamageApplied');
    expect(fall?.payload).toMatchObject({ targetId: RAIDER_1, fallFt: 10, rolls: [4] });
  });
});
