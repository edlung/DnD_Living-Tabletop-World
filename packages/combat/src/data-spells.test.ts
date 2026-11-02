import type { CharacterSheet } from '@ltw/contracts';
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

/**
 * SRD spells cast from their data (docs/adr/0052-spells-as-data.md §5) on the Old Trade Road:
 * Elowen (level 15) also studies as a wizard here. She stands at (2, 6), Raider 1 at (8, 4), 30 ft
 * off; Raiders 2 and 3 and the Shaman crowd around (11, 6).
 */
const WIZARD = [
  'fire-bolt',
  'magic-missile',
  'shatter',
  'cure-wounds',
  'hold-person',
  'false-life',
  'alarm',
  'burning-hands',
];

async function wizard(
  world: RoadWorld,
  change: (sheet: CharacterSheet) => CharacterSheet = (s) => s,
) {
  const sheet = (await world.state()).characterSheets.get(ELOWEN);
  if (!sheet) throw new Error('no sheet');
  const next: CharacterSheet = change({
    ...sheet,
    abilities: { ...sheet.abilities, int: 16 },
    spellcasting: [...sheet.spellcasting, { source: 'wizard', ability: 'int', spells: WIZARD }],
  });
  expect(codeOf(await world.dm({ type: 'SetCharacterSheet', entityId: ELOWEN, sheet: next }))).toBe(
    'accepted',
  );
}

const cast = (world: RoadWorld, command: Record<string, unknown>) =>
  world.submit({ type: 'CastSpell', combatantId: ELOWEN, ...command }, PLAYER);
const reasonOf = (result: Awaited<ReturnType<RoadWorld['submit']>>) =>
  result.status === 'rejected' ? result.message : result.status;

describe('a cantrip', () => {
  it('Fire Bolt: a spell attack, three d10 at level 15, no slot', async () => {
    const world = await roadWorld();
    await wizard(world);
    await startAmbush(world);
    const slots = (await world.state()).characterSheets.get(ELOWEN)?.spellSlots.expended;
    world.roll(20, 18);
    world.roll(10, 3, 4, 5);
    const bolt = await cast(world, { spellId: 'fire-bolt', targetId: RAIDER_1 });
    expect(codeOf(bolt)).toBe('accepted');
    const events = await recorded(world, bolt);
    expect(events.find((e) => e.type === 'SpellCast')?.payload).toMatchObject({
      spellId: 'fire-bolt',
      slotLevel: null,
      free: false,
    });
    expect(events.find((e) => e.type === 'AttackPerformed')?.payload).toMatchObject({
      attackId: 'fire-bolt',
      hit: true,
    });
    expect(events.find((e) => e.type === 'DamageApplied')?.payload).toMatchObject({
      targetId: RAIDER_1,
      damageType: 'fire',
      rolls: [3, 4, 5],
    });
    expect((await world.state()).characterSheets.get(ELOWEN)?.spellSlots.expended).toEqual(slots);
    await verifyHistory(world);
  });
});

describe('spells with a slot', () => {
  it('Magic Missile: three darts of one roll, at one target or several; a fourth at level 2', async () => {
    const world = await roadWorld();
    await wizard(world);
    await startAmbush(world);
    world.roll(4, 3);
    const darts = await cast(world, {
      spellId: 'magic-missile',
      using: { slotLevel: 1 },
      targetIds: [RAIDER_1, RAIDER_1, RAIDER_2],
    });
    expect(codeOf(darts)).toBe('accepted');
    const hits = (await recorded(world, darts)).filter((e) => e.type === 'DamageApplied');
    expect(hits.map((e) => e.payload.targetId)).toEqual([RAIDER_1, RAIDER_1, RAIDER_2]);
    expect(hits.every((e) => e.payload.rolls.join() === '3')).toBe(true);
    // Four darts are too many for a level 1 slot.
    const again = await roadWorld();
    await wizard(again);
    await startAmbush(again);
    const four = [RAIDER_1, RAIDER_1, RAIDER_2, RAIDER_3];
    expect(
      reasonOf(
        await cast(again, { spellId: 'magic-missile', using: { slotLevel: 1 }, targetIds: four }),
      ),
    ).toBe('TOO_MANY_TARGETS');
    expect(
      codeOf(
        await cast(again, { spellId: 'magic-missile', using: { slotLevel: 2 }, targetIds: four }),
      ),
    ).toBe('accepted');
  });

  it('Shatter: one roll for all in its sphere, each saving for half', async () => {
    const world = await roadWorld();
    await wizard(world);
    await startAmbush(world);
    world.roll(8, 8, 8, 8);
    world.roll(20, 2, 20, 2);
    const blast = await cast(world, {
      spellId: 'shatter',
      using: { slotLevel: 2 },
      point: { x: 11, y: 6 },
    });
    expect(codeOf(blast)).toBe('accepted');
    const events = await recorded(world, blast);
    const saves = events.filter((e) => e.type === 'SavingThrowRolled');
    expect(saves.map((e) => e.payload.creatureId).sort()).toEqual(
      [RAIDER_2, RAIDER_3, SHAMAN].sort(),
    );
    const damage = events.filter((e) => e.type === 'DamageApplied').map((e) => e.payload.amount);
    // 24 on a failure, 12 on a success (before any resistance).
    expect(damage.some((amount) => amount === 12)).toBe(true);
    expect(events.find((e) => e.type === 'SpellCast')?.payload).toMatchObject({ forDm: 'rest' });
    await verifyHistory(world);
  });

  it('Hold Person: Paralyzed on a failure, a save at each turn’s end, Concentration held', async () => {
    const world = await roadWorld();
    await wizard(world);
    await startAmbush(world);
    world.roll(20, 1);
    const held = await cast(world, {
      spellId: 'hold-person',
      using: { slotLevel: 2 },
      targetId: RAIDER_1,
    });
    expect(codeOf(held)).toBe('accepted');
    const state = await world.state();
    const raider = state.encounter?.combatants.find((one) => one.entityId === RAIDER_1);
    expect(raider?.conditionDetails?.find((one) => one.condition === 'paralyzed')).toMatchObject({
      sourceId: ELOWEN,
      until: { turnOf: ELOWEN, at: 'start', turns: 10 },
      save: { ability: 'wis' },
      spell: true,
    });
    expect(state.characterSheets.get(ELOWEN)?.concentration).toEqual({ spellId: 'hold-person' });
    await verifyHistory(world);
  });
});

describe('healing and temporary hit points, and spells outside a fight', () => {
  it('Cure Wounds by touch, False Life on herself, and a ritual with no slot', async () => {
    const world = await roadWorld();
    await wizard(world);
    const hurt = await world.dm({
      type: 'AdjustHitPoints',
      targetId: ELOWEN,
      change: 'damage',
      amount: 30,
      damageType: 'bludgeoning',
      reason: 'A fall',
    });
    expect(codeOf(hurt)).toBe('accepted');
    world.roll(8, 5, 6);
    const cure = await cast(world, {
      spellId: 'cure-wounds',
      using: { slotLevel: 1 },
      targetId: ELOWEN,
    });
    expect(codeOf(cure)).toBe('accepted');
    // 5 + 6 + Intelligence's +3.
    expect(
      (await recorded(world, cure)).find((e) => e.type === 'HealingApplied')?.payload,
    ).toMatchObject({
      amount: 14,
    });
    world.roll(4, 4, 4);
    const life = await cast(world, { spellId: 'false-life', using: { slotLevel: 1 } });
    expect(codeOf(life)).toBe('accepted');
    expect((await world.state()).characterSheets.get(ELOWEN)?.hitPoints.temporary).toBe(12);
    const slots = (await world.state()).characterSheets.get(ELOWEN)?.spellSlots.expended;
    expect(codeOf(await cast(world, { spellId: 'alarm', using: 'ritual' }))).toBe('accepted');
    expect((await world.state()).characterSheets.get(ELOWEN)?.spellSlots.expended).toEqual(slots);
    // A fire bolt needs the fight's board.
    expect(reasonOf(await cast(world, { spellId: 'fire-bolt', targetId: RAIDER_1 }))).toBe(
      'NOT_IN_COMBAT',
    );
    await verifyHistory(world);
  });

  it('refuses a spell she does not know, and one of minutes in a fight', async () => {
    const world = await roadWorld();
    await wizard(world);
    await startAmbush(world);
    expect(reasonOf(await cast(world, { spellId: 'wish', using: { slotLevel: 4 } }))).toBe(
      'NOT_KNOWN',
    );
    expect(reasonOf(await cast(world, { spellId: 'alarm', using: { slotLevel: 1 } }))).toBe(
      'TAKES_TOO_LONG',
    );
    expect(reasonOf(await cast(world, { spellId: 'alarm', using: 'ritual' }))).toBe(
      'TAKES_TOO_LONG',
    );
  });
});
