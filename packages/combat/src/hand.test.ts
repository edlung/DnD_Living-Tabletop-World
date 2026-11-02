import { describe, expect, it } from 'vitest';

import {
  ELOWEN,
  PLAYER,
  RAIDER_1,
  codeOf,
  recorded,
  roadWorld,
  startAmbush,
  type RoadWorld,
} from './testing/road.ts';
import { hitPoints, vitalsOf } from './vitals.ts';

/**
 * The DM's hand (docs/adr/0043-dm-screen.md §1): damage, healing, a condition and Heroic
 * Inspiration by hand, through the fight's own rules, with the DM's reason; a player cannot.
 */
const REASON = 'The rope bridge gave way';

async function hp(world: RoadWorld, entityId: string) {
  const vitals = vitalsOf(await world.state(), entityId);
  if (!vitals) throw new Error('no vitals');
  return hitPoints(vitals);
}

describe('the DM’s damage and healing', () => {
  it('records the DM’s change, not a creature’s attack, in a fight or not', async () => {
    const world = await roadWorld();
    const before = (await hp(world, ELOWEN)).current;
    const damage = await world.dm({
      type: 'AdjustHitPoints',
      targetId: ELOWEN,
      change: 'damage',
      amount: 7,
      damageType: 'bludgeoning',
      reason: REASON,
    });
    expect(codeOf(damage)).toBe('accepted');
    const events = await recorded(world, damage);
    expect(events.map((event) => event.type)).toEqual([
      'PremisesRecorded',
      'HitPointsAdjusted',
      'CharacterSheetSet',
    ]);
    expect(events[1]?.payload).toEqual({
      targetId: ELOWEN,
      change: 'damage',
      amount: 7,
      damageType: 'bludgeoning',
      hpBefore: before,
      hpAfter: before - 7,
    });
    expect((await hp(world, ELOWEN)).current).toBe(before - 7);

    const healing = await world.dm({
      type: 'AdjustHitPoints',
      targetId: ELOWEN,
      change: 'healing',
      amount: 50,
      reason: 'A night at the inn',
    });
    // Up to the maximum only: the record says how much was healed.
    expect((await recorded(world, healing))[1]?.payload).toMatchObject({ amount: 7 });
    expect((await hp(world, ELOWEN)).current).toBe(before);
    expect(
      codeOf(
        await world.dm({
          type: 'AdjustHitPoints',
          targetId: ELOWEN,
          change: 'healing',
          amount: 1,
          reason: 'More',
        }),
      ),
    ).toBe('NO_EFFECT');
  });

  it('drops a character to 0 like a hit would, and a creature dies', async () => {
    const world = await roadWorld();
    await startAmbush(world);
    const { current } = await hp(world, ELOWEN);
    const fall = await world.dm({
      type: 'AdjustHitPoints',
      targetId: ELOWEN,
      change: 'damage',
      amount: current,
      damageType: 'fire',
      reason: REASON,
    });
    const types = (await recorded(world, fall)).map((event) => event.type);
    expect(types).toEqual([
      'PremisesRecorded',
      'HitPointsAdjusted',
      'ConditionApplied',
      'ConditionApplied',
      'CharacterSheetSet',
    ]);
    const sheet = (await world.state()).characterSheets.get(ELOWEN);
    expect(sheet?.conditions).toEqual(expect.arrayContaining(['unconscious', 'prone']));
    expect(sheet?.deathSaves).toEqual({ successes: 0, failures: 0 });

    const raider = await world.dm({
      type: 'AdjustHitPoints',
      targetId: RAIDER_1,
      change: 'damage',
      amount: 99,
      damageType: 'slashing',
      reason: 'The rockfall',
    });
    expect((await recorded(world, raider)).map((event) => event.type)).toContain(
      'EntityStatusChanged',
    );
    // A dead creature is no target.
    expect(
      codeOf(
        await world.dm({
          type: 'AdjustHitPoints',
          targetId: RAIDER_1,
          change: 'healing',
          amount: 5,
          reason: 'Mercy',
        }),
      ),
    ).toBe('TARGET_DEAD');
  });

  it('refuses damage without a type, healing with one, and a player', async () => {
    const world = await roadWorld();
    const base = { type: 'AdjustHitPoints', targetId: ELOWEN, amount: 3, reason: REASON };
    expect(codeOf(await world.dm({ ...base, change: 'damage' }))).toBe('INVALID_COMMAND');
    expect(codeOf(await world.dm({ ...base, change: 'healing', damageType: 'fire' }))).toBe(
      'INVALID_COMMAND',
    );
    expect(
      codeOf(await world.submit({ ...base, change: 'damage', damageType: 'fire' }, PLAYER)),
    ).toBe('FORBIDDEN');
    expect(
      codeOf(await world.dm({ ...base, change: 'damage', damageType: 'fire', reason: '' })),
    ).toBe('INVALID_COMMAND');
  });
});

describe('the DM’s conditions and Heroic Inspiration', () => {
  it('sets and lifts a condition, Unconscious with Prone, never at 0 hit points', async () => {
    const world = await roadWorld();
    const set = (condition: string, applied: boolean) =>
      world.dm({ type: 'SetCondition', targetId: ELOWEN, condition, applied, reason: REASON });
    expect(codeOf(await set('unconscious', true))).toBe('accepted');
    expect((await world.state()).characterSheets.get(ELOWEN)?.conditions).toEqual(
      expect.arrayContaining(['unconscious', 'prone']),
    );
    expect(codeOf(await set('unconscious', true))).toBe('NO_EFFECT');
    expect(codeOf(await set('unconscious', false))).toBe('accepted');
    expect(codeOf(await set('prone', false))).toBe('accepted');
    expect((await world.state()).characterSheets.get(ELOWEN)?.conditions).toEqual([]);

    const { current } = await hp(world, ELOWEN);
    await world.dm({
      type: 'AdjustHitPoints',
      targetId: ELOWEN,
      change: 'damage',
      amount: current,
      damageType: 'cold',
      reason: REASON,
    });
    expect(codeOf(await set('unconscious', false))).toBe('ILLEGAL_ACTION');
  });

  it('grants and takes back Heroic Inspiration, a character’s only', async () => {
    const world = await roadWorld();
    const inspire = (characterId: string, inspired: boolean) =>
      world.dm({ type: 'SetInspiration', characterId, inspired, reason: 'A brave speech' });
    expect(codeOf(await inspire(ELOWEN, true))).toBe('accepted');
    expect((await world.state()).characterSheets.get(ELOWEN)?.heroicInspiration).toBe(true);
    expect(codeOf(await inspire(ELOWEN, true))).toBe('NO_EFFECT');
    expect(codeOf(await inspire(ELOWEN, false))).toBe('accepted');
    expect((await world.state()).characterSheets.get(ELOWEN)).not.toHaveProperty(
      'heroicInspiration',
    );
    expect(codeOf(await inspire(RAIDER_1, true))).toBe('INVALID_COMMAND');
  });

  it('can be undone, and an earlier change under a later one cannot', async () => {
    const world = await roadWorld();
    const first = await world.dm({
      type: 'AdjustHitPoints',
      targetId: ELOWEN,
      change: 'damage',
      amount: 5,
      damageType: 'fire',
      reason: REASON,
    });
    await world.dm({
      type: 'AdjustHitPoints',
      targetId: ELOWEN,
      change: 'damage',
      amount: 4,
      damageType: 'fire',
      reason: REASON,
    });
    if (first.status !== 'accepted') throw new Error('first damage');
    expect(codeOf(await world.dm({ type: 'UndoCommand', targetCommandId: first.commandId }))).toBe(
      'UNDO_UNSAFE',
    );
  });
});
