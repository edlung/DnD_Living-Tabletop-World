import type { CommandResult, StatBlock } from '@ltw/contracts';
import { resolvePerspective } from '@ltw/domain';
import { describe, expect, it } from 'vitest';

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
import { encounterView } from './view.ts';
import { hitPoints, vitalsOf } from './vitals.ts';

/**
 * Temporary hit points, a lowered maximum, a target's defenses, knocking out and first aid
 * (docs/adr/0048-hit-points.md). Elowen at (9, 7) beside Raider 2 at (10, 7), a shortsword added
 * to her sheet: d20 + 9 to hit, 1d6 + 4 piercing. Raiders: AC 15, 10 hit points. Elowen: 78.
 */
async function fight(block?: (raider: StatBlock) => StatBlock): Promise<RoadWorld> {
  const world = await roadWorld();
  const state = await world.state();
  const sheet = state.characterSheets.get(ELOWEN);
  const raider = state.statBlocks.get(RAIDER_2);
  if (!sheet || !raider) throw new Error('no sheet');
  const armed = { ...sheet, weapons: ['longbow', 'shortsword'] };
  expect(
    codeOf(await world.dm({ type: 'SetCharacterSheet', entityId: ELOWEN, sheet: armed })),
  ).toBe('accepted');
  if (block) {
    const set = await world.dm({
      type: 'SetStatBlock',
      entityId: RAIDER_2,
      statBlock: block(raider),
    });
    expect(codeOf(set)).toBe('accepted');
  }
  await startAmbush(world, undefined, (command) => ({
    ...command,
    combatants: command.combatants.map((entry) =>
      entry.entityId === ELOWEN ? { ...entry, position: { x: 9, y: 7 } } : entry,
    ),
  }));
  return world;
}

/** Her shortsword at Raider 2: the d20 shows 15, the d6 `face`. */
const stab = (world: RoadWorld, face: number, more: Record<string, unknown> = {}) => {
  world.roll(20, 15);
  world.roll(6, face);
  return world.submit({
    type: 'Attack',
    combatantId: ELOWEN,
    attackId: 'shortsword',
    targetId: RAIDER_2,
    ...more,
  });
};

const REASON = 'A test of the rules';
const hand = (world: RoadWorld, targetId: string, change: string, amount: number, type?: string) =>
  world.dm({
    type: 'AdjustHitPoints',
    targetId,
    change,
    amount,
    ...(type === undefined ? {} : { damageType: type }),
    reason: REASON,
  });

const damageOf = async (world: RoadWorld, result: CommandResult) =>
  (await recorded(world, result)).find((event) => event.type === 'DamageApplied')?.payload;
const vitals = async (world: RoadWorld, id: string) => {
  const found = vitalsOf(await world.state(), id);
  if (!found) throw new Error('no vitals');
  return found;
};
const hp = async (world: RoadWorld, id: string) => hitPoints(await vitals(world, id));
const conditions = async (world: RoadWorld, id: string) =>
  (await vitals(world, id)).kind === 'character'
    ? ((await world.state()).characterSheets.get(id)?.conditions ?? [])
    : ((await world.state()).statBlocks.get(id)?.conditions ?? []);
const knockedOut = async (world: RoadWorld, id: string) =>
  (await world.state()).statBlocks.get(id)?.knockedOut === true;
const statusOf = async (world: RoadWorld, id: string) =>
  (await world.state()).entities.get(id)?.status;
const reasonOf = (result: CommandResult) =>
  result.status === 'rejected' ? result.message : result.status;

describe('a target’s defenses', () => {
  it('Resistance halves the damage, rounded down; the record keeps what was dealt', async () => {
    const world = await fight((raider) => ({ ...raider, resistances: ['piercing'] }));
    const hit = await stab(world, 3);
    expect(await damageOf(world, hit)).toMatchObject({
      amount: 3,
      dealt: 7,
      defense: 'resisted',
      hpBefore: 10,
      hpAfter: 7,
    });
    expect(hit.status === 'accepted' && hit.outcome).toMatchObject({
      kind: 'Attack',
      damage: 3,
      defense: 'resisted',
    });
    await verifyHistory(world);
  });

  it('Vulnerability doubles it, Immunity leaves none', async () => {
    const weak = await fight((raider) => ({ ...raider, vulnerabilities: ['piercing'] }));
    expect(await damageOf(weak, await stab(weak, 1))).toMatchObject({
      amount: 10,
      dealt: 5,
      defense: 'vulnerable',
      hpAfter: 0,
    });
    expect(await statusOf(weak, RAIDER_2)).toBe('dead');

    const proof = await fight((raider) => ({ ...raider, immunities: ['piercing'] }));
    expect(await damageOf(proof, await stab(proof, 6))).toMatchObject({
      amount: 0,
      defense: 'immune',
      hpAfter: 10,
    });
  });

  it('Petrified’s Resistance and the stat block’s count once', async () => {
    const world = await fight((raider) => ({ ...raider, resistances: ['piercing'] }));
    const stone = await world.dm({
      type: 'SetCondition',
      targetId: RAIDER_2,
      condition: 'petrified',
      applied: true,
      reason: REASON,
    });
    expect(codeOf(stone)).toBe('accepted');
    expect(codeOf(await hand(world, RAIDER_2, 'damage', 9, 'piercing'))).toBe('accepted');
    expect((await hp(world, RAIDER_2)).current).toBe(10 - 4);
  });
});

describe('temporary hit points', () => {
  it('do not stack — the higher stays — and are lost first', async () => {
    const world = await roadWorld();
    expect(codeOf(await hand(world, ELOWEN, 'temporary', 5))).toBe('accepted');
    expect(codeOf(await hand(world, ELOWEN, 'temporary', 3))).toBe('NO_EFFECT');
    expect(codeOf(await hand(world, ELOWEN, 'temporary', 8))).toBe('accepted');
    expect(await hp(world, ELOWEN)).toEqual({ max: 78, current: 78, temporary: 8 });
    const hurt = await hand(world, ELOWEN, 'damage', 10, 'piercing');
    expect(
      (await recorded(world, hurt)).find((e) => e.type === 'HitPointsAdjusted')?.payload,
    ).toMatchObject({
      hpBefore: 78,
      hpAfter: 76,
    });
    expect(await hp(world, ELOWEN)).toEqual({ max: 78, current: 76 });
    await verifyHistory(world);
  });

  it('are no healing: the dying keep dying, and the buffer takes the blows first', async () => {
    const world = await roadWorld();
    await hand(world, ELOWEN, 'damage', 78, 'bludgeoning');
    expect(codeOf(await hand(world, ELOWEN, 'temporary', 5))).toBe('accepted');
    expect(await conditions(world, ELOWEN)).toContain('unconscious');
    await hand(world, ELOWEN, 'damage', 3, 'bludgeoning');
    const sheet = () => world.state().then((state) => state.characterSheets.get(ELOWEN));
    expect((await sheet())?.deathSaves).toEqual({ successes: 0, failures: 0 });
    await hand(world, ELOWEN, 'damage', 4, 'bludgeoning');
    expect((await sheet())?.deathSaves).toEqual({ successes: 0, failures: 1 });
    expect(await hp(world, ELOWEN)).toEqual({ max: 78, current: 0 });
  });
});

describe('a lowered maximum', () => {
  it('caps the hit points and every healing', async () => {
    const world = await roadWorld();
    const lowered = await hand(world, ELOWEN, 'reduce-maximum', 30);
    expect(
      (await recorded(world, lowered)).find((e) => e.type === 'HitPointsAdjusted')?.payload,
    ).toMatchObject({
      change: 'reduce-maximum',
      amount: 30,
      hpBefore: 78,
      hpAfter: 48,
    });
    expect(await hp(world, ELOWEN)).toEqual({ max: 78, current: 48, reducedBy: 30 });
    expect(codeOf(await hand(world, ELOWEN, 'healing', 10))).toBe('NO_EFFECT');
    await hand(world, ELOWEN, 'damage', 10, 'slashing');
    await hand(world, ELOWEN, 'healing', 20);
    expect((await hp(world, ELOWEN)).current).toBe(48);
    await verifyHistory(world);
  });

  it('kills the creature whose maximum reaches 0', async () => {
    const world = await roadWorld();
    expect(codeOf(await hand(world, RAIDER_1, 'reduce-maximum', 12))).toBe('accepted');
    expect(await statusOf(world, RAIDER_1)).toBe('dead');
  });
});

describe('knocking a creature out', () => {
  it('a melee blow that would bring it to 0 leaves it at 1 hit point, Unconscious and Prone', async () => {
    const world = await fight();
    const blow = await stab(world, 6, { knockOut: true });
    expect(await damageOf(world, blow)).toMatchObject({ amount: 10, hpAfter: 1, knockedOut: true });
    expect(blow.status === 'accepted' && blow.outcome).toMatchObject({ knockedOut: true });
    expect((await hp(world, RAIDER_2)).current).toBe(1);
    expect(await conditions(world, RAIDER_2)).toEqual(
      expect.arrayContaining(['unconscious', 'prone']),
    );
    expect(await knockedOut(world, RAIDER_2)).toBe(true);
    expect(await statusOf(world, RAIDER_2)).toBe('active');
    // Down, as the dying are, to everyone who sees it.
    const state = await world.state();
    const access = resolvePerspective(state, PLAYER, { kind: 'PLAYER' });
    if (!access.ok) throw new Error(access.reason);
    const seen = encounterView(state, access.perspective)?.combatants.find(
      (c) => c.entity.entityId === RAIDER_2,
    );
    expect(seen?.state).toBe('down');
    await verifyHistory(world);
  });

  it('a blow that leaves hit points is a blow, and a shot cannot knock out', async () => {
    const world = await fight();
    await stab(world, 1, { knockOut: true });
    expect((await hp(world, RAIDER_2)).current).toBe(5);
    expect(await knockedOut(world, RAIDER_2)).toBe(false);
    // The longbow beside a foe: Disadvantage, both d20s 15; 6 + 4 kills Raider 1 outright.
    world.roll(20, 15, 15);
    world.roll(8, 6);
    const shot = await world.submit({
      type: 'Attack',
      combatantId: ELOWEN,
      attackId: 'longbow',
      targetId: RAIDER_1,
      knockOut: true,
    });
    expect(await damageOf(world, shot)).toMatchObject({ hpAfter: 0 });
    expect(await statusOf(world, RAIDER_1)).toBe('dead');
  });

  it('wakes when it regains hit points; the DM’s Unconscious stays through healing', async () => {
    const world = await fight();
    await stab(world, 6, { knockOut: true });
    expect(codeOf(await hand(world, RAIDER_2, 'healing', 2))).toBe('accepted');
    expect(await conditions(world, RAIDER_2)).not.toContain('unconscious');
    expect(await conditions(world, RAIDER_2)).toContain('prone');
    expect(await knockedOut(world, RAIDER_2)).toBe(false);

    await hand(world, RAIDER_3, 'damage', 3, 'slashing');
    await world.dm({
      type: 'SetCondition',
      targetId: RAIDER_3,
      condition: 'unconscious',
      applied: true,
      reason: REASON,
    });
    await hand(world, RAIDER_3, 'healing', 3);
    expect(await conditions(world, RAIDER_3)).toContain('unconscious');
    await verifyHistory(world);
  });

  it('dies of the next blow that brings it to 0', async () => {
    const world = await fight();
    await stab(world, 6, { knockOut: true });
    await hand(world, RAIDER_2, 'damage', 1, 'piercing');
    expect(await statusOf(world, RAIDER_2)).toBe('dead');
    expect(await knockedOut(world, RAIDER_2)).toBe(false);
  });
});

describe('first aid', () => {
  /** Her turn ends; the Shaman's starts, and it steps to (11, 7), beside Raider 2. */
  async function shamanBeside(world: RoadWorld, path = [{ x: 11, y: 7 }]) {
    expect(codeOf(await world.submit({ type: 'EndTurn', combatantId: ELOWEN }, PLAYER))).toBe(
      'accepted',
    );
    const moved = await world.dm({ type: 'MoveCombatant', combatantId: SHAMAN, path });
    expect(codeOf(moved)).toBe('accepted');
  }
  const aid = (world: RoadWorld, targetId: string, face = 15) => {
    world.roll(20, face);
    return world.dm({
      type: 'TakeAction',
      combatantId: SHAMAN,
      action: 'first-aid',
      targetId,
      skill: 'medicine',
    });
  };

  it('wakes the knocked out: an action and a DC 10 Medicine check', async () => {
    const world = await fight();
    await stab(world, 6, { knockOut: true });
    await shamanBeside(world);
    const aided = await aid(world, RAIDER_2);
    const taken = (await recorded(world, aided)).find((event) => event.type === 'ActionTaken');
    expect(taken?.payload).toMatchObject({
      action: 'first-aid',
      targetId: RAIDER_2,
      check: { skill: 'medicine', success: true },
    });
    expect(await conditions(world, RAIDER_2)).not.toContain('unconscious');
    expect(await knockedOut(world, RAIDER_2)).toBe(false);
    expect((await hp(world, RAIDER_2)).current).toBe(1);
    await verifyHistory(world);
  });

  it('stabilizes the dying', async () => {
    const world = await fight();
    await hand(world, ELOWEN, 'damage', 78, 'bludgeoning');
    await shamanBeside(world, [
      { x: 11, y: 6 },
      { x: 10, y: 6 },
    ]);
    expect(codeOf(await aid(world, ELOWEN))).toBe('accepted');
    const sheet = (await world.state()).characterSheets.get(ELOWEN);
    expect(sheet?.deathSaves).toEqual({ successes: 3, failures: 0 });
    expect(sheet?.conditions).toContain('unconscious');
  });

  it('is refused for one who needs none, and out of reach', async () => {
    const world = await fight();
    await shamanBeside(world);
    expect(reasonOf(await aid(world, RAIDER_2))).toBe('NEEDS_NO_AID');
    await hand(world, RAIDER_3, 'damage', 9, 'slashing');
    expect(reasonOf(await aid(world, ELOWEN))).toBe('OUT_OF_RANGE');
  });
});
