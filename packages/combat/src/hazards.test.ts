import type { CharacterSheet } from '@ltw/contracts';
import { describe, expect, it } from 'vitest';

import {
  DM,
  ELOWEN,
  PLAYER,
  codeOf,
  recorded,
  roadWorld,
  startAmbush,
  type RoadWorld,
} from './testing/road.ts';
import { verifyHistory } from './testing/verify.ts';

/**
 * Hazards, poison and armor (docs/adr/0050-the-world-around.md §8–10) on the Old Trade Road, with
 * Elowen (Strength 10, Constitution 14, Speed 30) as the test makes her.
 */
const sheetOf = async (world: RoadWorld, id = ELOWEN) => {
  const sheet = (await world.state()).characterSheets.get(id);
  if (!sheet) throw new Error('no sheet');
  return sheet;
};
async function reshape(world: RoadWorld, change: (sheet: CharacterSheet) => CharacterSheet) {
  const next = change(await sheetOf(world));
  expect(codeOf(await world.dm({ type: 'SetCharacterSheet', entityId: ELOWEN, sheet: next }))).toBe(
    'accepted',
  );
}
/** The characters a hazard reaches: the living, with a sheet. */
const party = async (world: RoadWorld) => {
  const state = await world.state();
  return [...state.entities.values()].filter(
    (entity) =>
      entity.kind === 'character' &&
      entity.status === 'active' &&
      state.characterSheets.has(entity.entityId),
  );
};

describe('breath under water', () => {
  it('runs out after its rounds, an Exhaustion level each turn after, and comes back in the air', async () => {
    const world = await roadWorld();
    // Constitution 8: 30 seconds of breath, five rounds.
    await reshape(world, (sheet) => ({ ...sheet, abilities: { ...sheet.abilities, con: 8 } }));
    await startAmbush(world, undefined, (command) => ({
      ...command,
      battlefield: { ...command.battlefield, water: [{ x: 2, y: 6, deep: true }] },
    }));
    const turnBack = async () => {
      for (let step = 0; step < 12; step += 1) {
        const encounter = await world.encounter();
        const current = encounter.combatants[encounter.currentIndex]?.entityId;
        if (current === ELOWEN) return;
        await world.dm({ type: 'EndTurn', combatantId: current });
      }
    };
    for (let round = 1; round <= 5; round += 1) {
      await world.submit({ type: 'EndTurn', combatantId: ELOWEN }, PLAYER);
      await turnBack();
    }
    const holding = (await world.encounter()).combatants.find((c) => c.entityId === ELOWEN);
    expect(holding?.breath).toEqual({ roundsLeft: 0, gained: 0 });
    await world.submit({ type: 'EndTurn', combatantId: ELOWEN }, PLAYER);
    expect((await sheetOf(world)).exhaustion).toBe(1);
    await turnBack();
    // Out of the water, she breathes again: the level goes.
    expect(
      codeOf(
        await world.submit(
          { type: 'MoveCombatant', combatantId: ELOWEN, path: [{ x: 2, y: 5 }] },
          PLAYER,
        ),
      ),
    ).toBe('accepted');
    await world.submit({ type: 'EndTurn', combatantId: ELOWEN }, PLAYER);
    expect((await sheetOf(world)).exhaustion).toBeUndefined();
    const after = (await world.encounter()).combatants.find((c) => c.entityId === ELOWEN);
    expect(after?.breath).toBeUndefined();
    await verifyHistory(world);
  });
});

describe('hazards of the road', () => {
  it('two hours of extreme cold: two saves each, a level for each failure; Resistance passes', async () => {
    const world = await roadWorld();
    const exposed = await party(world);
    world.roll(20, ...exposed.flatMap(() => [1, 1]));
    const cold = await world.dm({
      type: 'ExposeToHazard',
      hazard: 'cold',
      hours: 2,
      reason: 'The pass',
    });
    expect(codeOf(cold)).toBe('accepted');
    const saves = (await recorded(world, cold)).filter((e) => e.type === 'SavingThrowRolled');
    expect(saves).toHaveLength(exposed.length * 2);
    expect(saves.every((save) => save.payload.dc === 10)).toBe(true);
    for (const entity of exposed)
      expect((await sheetOf(world, entity.entityId)).exhaustion).toBe(2);
    await verifyHistory(world);
    // Resistance to Cold passes without a save.
    const warm = await roadWorld();
    await reshape(warm, (sheet) => ({ ...sheet, resistances: ['cold'] }));
    const others = (await party(warm)).filter((entity) => entity.entityId !== ELOWEN);
    warm.roll(20, ...others.flatMap(() => [20, 20]));
    await warm.dm({ type: 'ExposeToHazard', hazard: 'cold', hours: 2, reason: 'The pass' });
    expect((await sheetOf(warm)).exhaustion).toBeUndefined();
  });

  it('heat rises a DC each hour, with Disadvantage in heavy armor', async () => {
    const world = await roadWorld();
    await reshape(world, (sheet) => ({ ...sheet, wornArmor: { weight: 'heavy', strength: 13 } }));
    world.roll(20, ...Array.from({ length: 40 }, () => 20));
    const heat = await world.dm({
      type: 'ExposeToHazard',
      hazard: 'heat',
      hours: 2,
      reason: 'The salt flats',
    });
    const mine = (await recorded(world, heat)).flatMap((e) =>
      e.type === 'SavingThrowRolled' && e.payload.creatureId === ELOWEN ? [e.payload] : [],
    );
    expect(mine.map((save) => save.dc)).toEqual([5, 6]);
    expect(mine.every((save) => save.rolls.length === 2)).toBe(true);
  });

  it('is not for a fight', async () => {
    const world = await roadWorld();
    await startAmbush(world);
    expect(
      codeOf(await world.dm({ type: 'ExposeToHazard', hazard: 'cold', hours: 1, reason: 'Snow' })),
    ).toBe('INVALID_COMMAND');
  });
});

describe('poison', () => {
  it('a Constitution save first: a success keeps her well, a failure poisons her', async () => {
    const poison = {
      type: 'SetCondition',
      targetId: ELOWEN,
      condition: 'poisoned',
      applied: true,
      resist: { ability: 'con', dc: 12 },
      reason: 'A poisoned blade',
    };
    const world = await roadWorld();
    world.roll(20, 18);
    const held = await world.dm(poison);
    expect(codeOf(held)).toBe('accepted');
    expect((await sheetOf(world)).conditions).not.toContain('poisoned');
    world.roll(20, 2);
    await world.dm(poison);
    expect((await sheetOf(world)).conditions).toContain('poisoned');
    await verifyHistory(world);
  });
});

describe('armor', () => {
  it('too heavy for her Strength takes 10 ft of her Speed; rustling armor hampers her Hide', async () => {
    const world = await roadWorld();
    await reshape(world, (sheet) => ({
      ...sheet,
      wornArmor: { weight: 'heavy', strength: 13, stealthDisadvantage: true },
    }));
    await startAmbush(world, undefined, (command) => ({
      ...command,
      battlefield: { ...command.battlefield, ambient: 'dark' },
    }));
    // 25 ft is past her 20.
    const far = await world.submit(
      {
        type: 'MoveCombatant',
        combatantId: ELOWEN,
        path: [1, 2, 3, 4, 5].map((step) => ({ x: 2 + step, y: 6 })),
      },
      PLAYER,
    );
    expect(codeOf(far)).not.toBe('accepted');
    world.roll(20, 15, 4);
    const hid = await world.submit(
      { type: 'TakeAction', combatantId: ELOWEN, action: 'hide', skill: 'stealth' },
      PLAYER,
    );
    const check = (await recorded(world, hid)).find((e) => e.type === 'ActionTaken');
    expect(check?.payload).toMatchObject({ check: { rolls: [15, 4] } });
    expect(DM.actorId).toBe('dm-ravenford');
  });
});
