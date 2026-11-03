import type { CharacterSheet, CommandResult } from '@ltw/contracts';
import { describe, expect, it } from 'vitest';

import {
  DM,
  ELOWEN,
  codeOf,
  recorded,
  roadWorld,
  startAmbush,
  type RoadWorld,
} from './testing/road.ts';
import { hitPoints, vitalsOf } from './vitals.ts';

/**
 * Class features in play (docs/adr/0056-characters-from-the-srd.md §4), through the World Engine:
 * Elowen's sheet is made a Fighter's, a Barbarian's, a Paladin's, a Bard's or a Wizard's for each.
 */
const use = (feature: string, extra: Record<string, unknown> = {}) => ({
  type: 'UseFeature',
  characterId: ELOWEN,
  feature,
  ...extra,
});
const message = (result: CommandResult) =>
  result.status === 'rejected' ? result.message : result.status;

async function sheetOf(world: RoadWorld, entityId = ELOWEN): Promise<CharacterSheet> {
  const sheet = (await world.state()).characterSheets.get(entityId);
  if (!sheet) throw new Error('no sheet');
  return sheet;
}

/** Elowen as the classes given, her hit points and the rest as `changes` say. */
async function become(
  world: RoadWorld,
  classes: CharacterSheet['classes'],
  changes: Partial<CharacterSheet> = {},
  entityId = ELOWEN,
) {
  const sheet = { ...(await sheetOf(world)), classes, ...changes };
  const set = await world.dm({ type: 'SetCharacterSheet', entityId, sheet });
  expect(codeOf(set)).toBe('accepted');
}

const hurt = { hitPoints: { max: 78, current: 40 } };

describe('class features', () => {
  it('Second Wind heals 1d10 + the Fighter level, twice until a rest at level 3', async () => {
    const world = await roadWorld();
    await become(world, [{ classId: 'fighter', level: 3 }], hurt);
    world.roll(10, 6);
    const first = await world.submit(use('second-wind'));
    expect(codeOf(first)).toBe('accepted');
    expect((await recorded(world, first)).map((event) => event.type)).toEqual([
      'PremisesRecorded',
      'FeatureUsed',
      'HealingApplied',
      'CharacterSheetSet',
    ]);
    expect(first.status === 'accepted' ? first.outcome : null).toMatchObject({
      kind: 'UseFeature',
      feature: 'second-wind',
      rolls: [6],
      healed: 9,
      left: 1,
    });
    world.roll(10, 2);
    expect(codeOf(await world.submit(use('second-wind')))).toBe('accepted');
    expect((await sheetOf(world)).hitPoints.current).toBe(40 + 9 + 5);
    expect(message(await world.submit(use('second-wind')))).toBe('NO_USES_LEFT');
  });

  it('spends the Bonus Action in a fight, and Action Surge gives the action again once', async () => {
    const world = await roadWorld();
    await become(world, [{ classId: 'fighter', level: 17 }], hurt);
    await startAmbush(world);
    world.roll(10, 5);
    expect(codeOf(await world.submit(use('second-wind')))).toBe('accepted');
    world.roll(10, 5);
    expect(message(await world.submit(use('second-wind')))).toBe('NO_BONUS_ACTION');
    expect(message(await world.submit(use('action-surge')))).toBe('ACTION_UNUSED');
    const dodge = { type: 'TakeAction', combatantId: ELOWEN, action: 'dodge' };
    expect(codeOf(await world.submit(dodge))).toBe('accepted');
    expect(codeOf(await world.submit(use('action-surge')))).toBe('accepted');
    const turn = (await world.encounter()).combatants.find((one) => one.entityId === ELOWEN)?.turn;
    expect(turn).toMatchObject({ actionUsed: false, surged: true });
    // Twice before a rest from 17, but once a turn; and its action is no Magic action.
    expect(message(await world.submit(use('action-surge')))).toBe('ALREADY_SURGED');
    const fireball = {
      type: 'CastSpell',
      combatantId: ELOWEN,
      spellId: 'fireball',
      point: { x: 10, y: 6 },
    };
    expect(message(await world.submit(fireball))).toBe('SURGE_NOT_MAGIC');
    expect(codeOf(await world.submit({ ...dodge }))).toBe('accepted');
  });

  it('Rage: a Bonus Action, not in heavy armor; ended by its player or a long rest', async () => {
    const world = await roadWorld();
    await become(world, [{ classId: 'barbarian', level: 3 }], {
      wornArmor: { weight: 'heavy', strength: 15 },
    });
    expect(message(await world.submit(use('rage')))).toBe('HEAVY_ARMOR');
    const unarmored = { ...(await sheetOf(world)) };
    delete unarmored.wornArmor;
    await world.dm({ type: 'SetCharacterSheet', entityId: ELOWEN, sheet: unarmored });
    expect(codeOf(await world.submit(use('rage')))).toBe('accepted');
    expect((await sheetOf(world)).raging).toBeDefined();
    // Slashing damage halved while it lasts.
    const before = (await sheetOf(world)).hitPoints.current;
    const cut = await world.dm({
      type: 'AdjustHitPoints',
      targetId: ELOWEN,
      change: 'damage',
      amount: 10,
      damageType: 'slashing',
      reason: 'A raider’s axe',
    });
    expect(codeOf(cut)).toBe('accepted');
    expect((await sheetOf(world)).hitPoints.current).toBe(before - 5);
    expect(message(await world.submit(use('rage')))).toBe('ALREADY_RAGING');
    expect(codeOf(await world.submit(use('end-rage')))).toBe('accepted');
    expect((await sheetOf(world)).raging).toBeUndefined();
    expect(message(await world.submit(use('end-rage')))).toBe('NOT_RAGING');
    // One Rage of three spent: a refused one spends none.
    expect((await sheetOf(world)).featureUses).toEqual({ rage: 1 });
  });

  it('Lay on Hands heals from its pool and spends five to end Poisoned', async () => {
    const world = await roadWorld();
    await become(world, [{ classId: 'paladin', level: 3 }], hurt);
    expect(codeOf(await world.submit(use('lay-on-hands', { amount: 10 })))).toBe('accepted');
    expect((await sheetOf(world)).hitPoints.current).toBe(50);
    expect(message(await world.submit(use('lay-on-hands', { option: 'cure-poison' })))).toBe(
      'NOT_POISONED',
    );
    const poisoned = await world.dm({
      type: 'SetCondition',
      targetId: ELOWEN,
      condition: 'poisoned',
      applied: true,
      reason: 'A poisoned dart',
    });
    expect(codeOf(poisoned)).toBe('accepted');
    expect(codeOf(await world.submit(use('lay-on-hands', { option: 'cure-poison' })))).toBe(
      'accepted',
    );
    const after = await sheetOf(world);
    expect(after.conditions).not.toContain('poisoned');
    expect(after.featureUses?.['lay-on-hands']).toBe(15);
    expect(message(await world.submit(use('lay-on-hands', { amount: 1 })))).toBe('NO_USES_LEFT');
  });

  it('Bardic Inspiration gives another its die; the holder rolls it once', async () => {
    const world = await roadWorld();
    await world.dm({
      type: 'CreateEntity',
      entityId: 'brann-ironvale',
      kind: 'character',
      name: 'Brann Ironvale',
      description: 'Fighter 5.',
      existsSince: null,
      placement: { locationId: 'market-square', since: 32400 },
    });
    await become(world, [{ classId: 'fighter', level: 5 }], {}, 'brann-ironvale');
    await become(world, [{ classId: 'bard', level: 5 }], {
      abilities: { str: 8, dex: 14, con: 12, int: 10, wis: 12, cha: 16 },
    });
    expect(message(await world.submit(use('bardic-inspiration')))).toBe('TARGET_REQUIRED');
    const give = use('bardic-inspiration', { targetId: 'brann-ironvale' });
    expect(codeOf(await world.submit(give))).toBe('accepted');
    expect((await sheetOf(world, 'brann-ironvale')).inspirationDie).toMatchObject({
      sides: 8,
      fromId: ELOWEN,
    });
    expect(message(await world.submit(give))).toBe('ALREADY_INSPIRED');
    world.roll(8, 7);
    const rolled = await world.submit(
      { type: 'UseFeature', characterId: 'brann-ironvale', feature: 'inspiration-die' },
      DM,
    );
    expect(rolled.status === 'accepted' ? rolled.outcome : null).toMatchObject({ rolls: [7] });
    expect((await sheetOf(world, 'brann-ironvale')).inspirationDie).toBeUndefined();
    // Charisma 16: three uses, one spent.
    expect((await sheetOf(world)).featureUses).toEqual({ 'bardic-inspiration': 1 });
  });

  it('Arcane Recovery regains slots of half the Wizard level, out of a fight only', async () => {
    const world = await roadWorld();
    const sheet = await sheetOf(world);
    await become(world, [{ classId: 'wizard', level: 8 }], {
      spellSlots: { max: sheet.spellSlots.max, expended: [2, 1, 1, 0, 0, 0, 0, 0, 0] },
    });
    expect(message(await world.submit(use('arcane-recovery', { slots: [3, 2] })))).toBe(
      'TOO_MANY_SLOTS',
    );
    expect(codeOf(await world.submit(use('arcane-recovery', { slots: [3, 1] })))).toBe('accepted');
    expect((await sheetOf(world)).spellSlots.expended.slice(0, 3)).toEqual([1, 1, 0]);
    expect(message(await world.submit(use('arcane-recovery', { slots: [1] })))).toBe(
      'NO_USES_LEFT',
    );
    const vitals = vitalsOf(await world.state(), ELOWEN);
    expect(vitals && hitPoints(vitals).current).toBeGreaterThan(0);
  });

  it('a player uses only their own character’s features', async () => {
    const world = await roadWorld();
    await become(world, [{ classId: 'fighter', level: 5 }], hurt);
    const stranger = { actorId: 'player:stranger', kind: 'user' } as const;
    expect(codeOf(await world.submit(use('second-wind'), stranger))).toBe('FORBIDDEN');
  });
});
