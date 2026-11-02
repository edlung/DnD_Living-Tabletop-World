import type { MonsterSaveAction, StatBlock } from '@ltw/contracts';
import { describe, expect, it } from 'vitest';

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
 * A creature's action with a save (docs/adr/0053-monsters-as-data.md §2) on the Old Trade Road:
 * Raider 1 at (8, 4) breathes fire in a 30-foot cone toward Elowen at (2, 6), DC 13, 4d6 Fire,
 * half on a success, Recharge 5–6.
 */
const BREATH: MonsterSaveAction = {
  actionId: 'fire-breath',
  name: 'Fire Breath',
  ability: 'dex',
  dc: 13,
  area: { shape: 'cone', sizeFt: 30, widthFt: null, origin: 'self' },
  reachFt: null,
  rangeFt: null,
  damage: [{ count: 4, sides: 6, bonus: 0, type: 'fire' }],
  onSuccess: 'half',
  recharge: 5,
  perDay: null,
};

async function fiery(action: MonsterSaveAction = BREATH): Promise<RoadWorld> {
  const world = await roadWorld();
  const block = (await world.state()).statBlocks.get(RAIDER_1) as StatBlock;
  const statBlock: StatBlock = { ...block, saveActions: [action] };
  expect(codeOf(await world.dm({ type: 'SetStatBlock', entityId: RAIDER_1, statBlock }))).toBe(
    'accepted',
  );
  await startAmbush(world);
  await turnOf(world, RAIDER_1);
  return world;
}

/** On to `entityId`'s turn; its turn's start rolls `d6` first (a queued face is the next command's). */
async function turnOf(world: RoadWorld, entityId: string, d6?: number) {
  for (let step = 0; step < 8; step += 1) {
    const encounter = await world.encounter();
    const current = encounter.combatants[encounter.currentIndex]?.entityId;
    if (current === entityId) return;
    const next = encounter.combatants[(encounter.currentIndex + 1) % encounter.combatants.length];
    if (d6 !== undefined && next?.entityId === entityId) world.roll(6, d6);
    await world.dm({ type: 'EndTurn', combatantId: current });
  }
}

const breathe = (world: RoadWorld) =>
  world.dm({
    type: 'UseCreatureAction',
    combatantId: RAIDER_1,
    actionId: 'fire-breath',
    point: { x: 2, y: 6 },
  });
const reasonOf = (result: Awaited<ReturnType<RoadWorld['dm']>>) =>
  result.status === 'rejected' ? result.message : result.status;

describe('a breath', () => {
  it('reaches those in its cone: one roll, a save each, the action spent', async () => {
    const world = await fiery();
    world.roll(6, 6, 6, 6, 6);
    world.roll(20, 2);
    const breath = await breathe(world);
    expect(codeOf(breath)).toBe('accepted');
    const events = await recorded(world, breath);
    expect(events.find((e) => e.type === 'SavingThrowRolled')?.payload).toMatchObject({
      creatureId: ELOWEN,
      ability: 'dex',
      dc: 13,
      purpose: 'creature-action',
      success: false,
    });
    expect(events.find((e) => e.type === 'DamageApplied')?.payload).toMatchObject({
      targetId: ELOWEN,
      damageType: 'fire',
      amount: 24,
    });
    const raider = (await world.encounter()).combatants.find((one) => one.entityId === RAIDER_1);
    expect(raider?.spent).toEqual(['fire-breath']);
    await verifyHistory(world);
  });

  it('comes back on a 5 or 6 at the start of its turn, and not before', async () => {
    const world = await fiery();
    await breathe(world);
    await world.dm({ type: 'EndTurn', combatantId: RAIDER_1 });
    // Round 2: a 2 keeps it spent.
    await turnOf(world, RAIDER_1, 2);
    const raider = (await world.encounter()).combatants.find((one) => one.entityId === RAIDER_1);
    expect(raider?.spent).toEqual(['fire-breath']);
    expect(reasonOf(await breathe(world))).toBe('NOT_RECHARGED');
    await world.dm({ type: 'EndTurn', combatantId: RAIDER_1 });
    // Round 3: a 5 brings it back.
    await turnOf(world, RAIDER_1, 5);
    expect(codeOf(await breathe(world))).toBe('accepted');
    await verifyHistory(world);
  });

  it('counts its uses per day', async () => {
    const world = await fiery({ ...BREATH, recharge: null, perDay: 1 });
    expect(codeOf(await breathe(world))).toBe('accepted');
    await world.dm({ type: 'EndTurn', combatantId: RAIDER_1 });
    await turnOf(world, RAIDER_1);
    expect(reasonOf(await breathe(world))).toBe('NO_USES_LEFT');
  });
});
