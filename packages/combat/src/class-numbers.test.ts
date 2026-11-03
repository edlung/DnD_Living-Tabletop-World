import type { CharacterSheet, CommandResult } from '@ltw/contracts';
import { describe, expect, it } from 'vitest';

import { rollSkill } from './actions.ts';
import { savedDamage } from './evasion.ts';
import { spellSave } from './saves.ts';
import {
  ELOWEN,
  RAIDER_2,
  RAIDER_3,
  codeOf,
  roadWorld,
  startAmbush,
  type RoadWorld,
} from './testing/road.ts';
import { rollInitiative, vitalsOf, type Vitals } from './vitals.ts';
import { weaponOf } from './weapon-view.ts';

/**
 * The class features that change numbers in a fight (docs/adr/0056-characters-from-the-srd.md §4):
 * Sneak Attack once a turn, a Champion's Critical Hit on a 19, Martial Arts, Danger Sense, Feral
 * Instinct, Reliable Talent and Evasion. Elowen's sheet is made each class's.
 */
const shoot = (targetId: string) => ({
  type: 'Attack',
  combatantId: ELOWEN,
  attackId: 'longbow',
  targetId,
});
const outcomeOf = (result: CommandResult) =>
  result.status === 'rejected' ? result.code : result.outcome;

async function become(world: RoadWorld, changes: Partial<CharacterSheet>) {
  const sheet = (await world.state()).characterSheets.get(ELOWEN);
  if (!sheet) throw new Error('no sheet');
  const set = await world.dm({
    type: 'SetCharacterSheet',
    entityId: ELOWEN,
    sheet: { ...sheet, ...changes },
  });
  expect(codeOf(set)).toBe('accepted');
}

async function restrain(world: RoadWorld, targetId: string) {
  const held = await world.dm({
    type: 'SetCondition',
    targetId,
    condition: 'restrained',
    applied: true,
    reason: 'A net',
  });
  expect(codeOf(held)).toBe('accepted');
}

/** A sheet of the classes given, for the rules read straight from its vitals. */
const vitalsAs = (sheet: CharacterSheet, changes: Partial<CharacterSheet>): Vitals => ({
  kind: 'character',
  entityId: ELOWEN,
  sheet: { ...sheet, ...changes },
});
const dice = (...faces: number[]) => {
  const queue = [...faces];
  return { roll: () => queue.shift() ?? 1 };
};

describe('the class features in a fight', () => {
  it('adds Sneak Attack to a hit with Advantage, once a turn', async () => {
    const world = await roadWorld();
    await become(world, { classes: [{ classId: 'rogue', level: 5 }] });
    await startAmbush(world);
    await restrain(world, RAIDER_2);
    await restrain(world, RAIDER_3);
    world.roll(20, 15, 12);
    world.roll(8, 2);
    world.roll(6, 1, 2, 3);
    const first = outcomeOf(await world.submit(shoot(RAIDER_2)));
    // 1d8 + 4 and three d6: 2 + 4 + 6.
    expect(first).toMatchObject({ hit: true, damage: 12 });
    const turn = (await world.encounter()).combatants.find((one) => one.entityId === ELOWEN)?.turn;
    expect(turn?.sneakAttacked).toBe(true);
    world.roll(20, 15, 12);
    world.roll(8, 2);
    expect(outcomeOf(await world.submit(shoot(RAIDER_3)))).toMatchObject({ hit: true, damage: 6 });
  });

  it('gives a Champion a Critical Hit on a 19', async () => {
    const world = await roadWorld();
    await become(world, { classes: [{ classId: 'fighter', level: 3, subclass: 'Champion' }] });
    await startAmbush(world);
    world.roll(20, 19);
    world.roll(8, 3, 3);
    expect(outcomeOf(await world.submit(shoot(RAIDER_2)))).toMatchObject({ critical: true });
  });

  it('rolls with Martial Arts, Danger Sense, Feral Instinct and Reliable Talent', async () => {
    const world = await roadWorld();
    const state = await world.state();
    const elowen = vitalsOf(state, ELOWEN);
    if (elowen?.kind !== 'character') throw new Error('no sheet');
    const scores = { str: 10, dex: 16, con: 12, int: 10, wis: 14, cha: 10 };
    const monk = vitalsAs(elowen.sheet, {
      classes: [{ classId: 'monk', level: 5 }],
      abilities: scores,
    });
    const strike = weaponOf(state, monk, 'unarmed-strike', 5);
    expect(typeof strike === 'string' ? null : strike.damage).toMatchObject({
      count: 1,
      sides: 8,
      bonus: 3,
    });
    const barbarian = vitalsAs(elowen.sheet, {
      classes: [{ classId: 'barbarian', level: 7 }],
      conditions: [],
    });
    // Danger Sense: two d20s on a Dexterity save, the higher counts.
    const saved = spellSave(dice(4, 18), barbarian, 'dex', 15, 'none');
    expect(saved.success).toBe(true);
    // Feral Instinct: two d20s for Initiative.
    expect(rollInitiative(dice(3, 17), barbarian).roll).toBe(17);
    const rogue = vitalsAs(elowen.sheet, {
      classes: [{ classId: 'rogue', level: 7 }],
      skills: { proficient: ['stealth'], expertise: [] },
      conditions: [],
    });
    // Reliable Talent: a 2 counts as a 10 for a proficient skill.
    expect(rollSkill(dice(2), rogue, 'stealth', 30).natural).toBe(10);
    expect(rollSkill(dice(2), rogue, 'athletics', 30).natural).toBe(2);
  });

  it('halves a Dexterity save’s damage again with Evasion', () => {
    const rogue: Vitals = {
      kind: 'character',
      entityId: ELOWEN,
      sheet: {
        classes: [{ classId: 'rogue', level: 7 }],
        conditions: [],
      } as unknown as CharacterSheet,
    };
    expect(savedDamage(rogue, 'dex', 'half', true, 20)).toBe(0);
    expect(savedDamage(rogue, 'dex', 'half', false, 20)).toBe(10);
    expect(savedDamage(rogue, 'con', 'half', true, 20)).toBe(10);
  });
});
