import type { CharacterSheet, Condition } from '@ltw/contracts';
import { describe, expect, it } from 'vitest';

import { attackCircumstances } from './combat.ts';
import {
  checkEffects,
  conditionBlocked,
  d20Modes,
  d20Penalty,
  damageAfterDefenses,
  exhaustionPenalty,
  incapacitatedBy,
  initiativeEffects,
  modeAfter,
  saveEffects,
  speedAfterConditions,
} from './conditions.ts';
import { longRest } from './rest.ts';

/** The conditions' effects (SRD 5.2.1; docs/adr/0045-conditions-and-actions.md §1, §3). */
const attack = (
  attackerConditions: Condition[],
  targetConditions: Condition[],
  distanceFt = 30,
  melee = false,
) =>
  attackCircumstances({
    attackerConditions,
    targetConditions,
    melee,
    distanceFt,
    longRange: false,
  });

describe('the conditions', () => {
  it('know which of them include Incapacitated', () => {
    for (const condition of [
      'incapacitated',
      'paralyzed',
      'petrified',
      'stunned',
      'unconscious',
    ] as const) {
      expect(incapacitatedBy([condition])).toBe(true);
    }
    for (const condition of [
      'blinded',
      'charmed',
      'frightened',
      'grappled',
      'poisoned',
      'prone',
      'restrained',
    ] as const) {
      expect(incapacitatedBy([condition])).toBe(false);
    }
  });

  it('hold a creature fast, slow it, and Exhaustion takes 5 ft a level', () => {
    for (const condition of [
      'grappled',
      'paralyzed',
      'petrified',
      'restrained',
      'unconscious',
    ] as const) {
      expect(speedAfterConditions(30, [condition])).toBe(0);
    }
    expect(speedAfterConditions(30, ['slowed'])).toBe(20);
    expect(speedAfterConditions(30, [], 2)).toBe(20);
    expect(speedAfterConditions(30, ['slowed'], 5)).toBe(0);
    expect(speedAfterConditions(30, ['poisoned', 'prone'])).toBe(30);
  });

  it('fail Strength and Dexterity saves outright when held, and Restrained worsens Dexterity', () => {
    for (const condition of ['paralyzed', 'petrified', 'stunned', 'unconscious'] as const) {
      expect(saveEffects('dex', [condition]).autoFail).toBe(true);
      expect(saveEffects('str', [condition]).autoFail).toBe(true);
      expect(saveEffects('con', [condition]).autoFail).toBe(false);
    }
    expect(saveEffects('dex', ['restrained'])).toMatchObject({
      autoFail: false,
      disadvantage: true,
    });
    expect(saveEffects('wis', ['restrained']).disadvantage).toBe(false);
    expect(saveEffects('wis', [], 3).penalty).toBe(-6);
  });

  it('give ability checks Disadvantage when Poisoned or Frightened', () => {
    expect(checkEffects(['poisoned']).disadvantage).toBe(true);
    expect(checkEffects(['frightened']).disadvantage).toBe(true);
    expect(checkEffects(['blinded', 'grappled']).disadvantage).toBe(false);
    expect(checkEffects([], 1).penalty).toBe(-2);
    expect(exhaustionPenalty(0)).toBe(0);
  });

  it('take the ordeal of one back from the dead off every D20 Test, beside Exhaustion', () => {
    // docs/adr/0056-characters-from-the-srd.md §5: −4 after Raise Dead or Resurrection.
    expect(d20Penalty(1, 4)).toBe(-6);
    expect(checkEffects([], 0, 4).penalty).toBe(-4);
    expect(saveEffects('wis', [], 0, 3).penalty).toBe(-3);
    expect(initiativeEffects([], 0, 2).penalty).toBe(-2);
    expect(d20Modes([], 1, 1).penalty).toBe(-3);
  });

  it('roll Initiative with Advantage when Invisible and Disadvantage when Incapacitated', () => {
    expect(initiativeEffects(['invisible'])).toMatchObject({
      advantage: true,
      disadvantage: false,
    });
    expect(initiativeEffects(['stunned'])).toMatchObject({ advantage: false, disadvantage: true });
  });

  it('shape attack rolls from both sides', () => {
    for (const condition of [
      'blinded',
      'frightened',
      'grappled',
      'poisoned',
      'prone',
      'restrained',
    ] as const) {
      expect(attack([condition], [])).toMatchObject({ advantage: false, disadvantage: true });
    }
    expect(attack(['invisible'], [])).toMatchObject({ advantage: true, disadvantage: false });
    for (const condition of [
      'blinded',
      'paralyzed',
      'petrified',
      'restrained',
      'stunned',
    ] as const) {
      expect(attack([], [condition]).advantage).toBe(true);
    }
    expect(attack([], ['invisible'])).toMatchObject({ advantage: false, disadvantage: true });
    // Both at once cancel where the roll is made; the flags say both.
    expect(attack(['poisoned'], ['restrained'])).toMatchObject({
      advantage: true,
      disadvantage: true,
    });
  });

  it('make a hit from within 5 ft on a Paralyzed or Unconscious target a Critical Hit', () => {
    expect(attack([], ['paralyzed'], 5, true).criticalOnHit).toBe(true);
    expect(attack([], ['paralyzed'], 10, true).criticalOnHit).toBe(false);
    expect(attack([], ['stunned'], 5, true).criticalOnHit).toBe(false);
    expect(attack([], ['unconscious'], 5, true).criticalOnHit).toBe(true);
  });

  it('halve damage to the Petrified, who cannot be Poisoned', () => {
    expect(damageAfterDefenses(11, 'fire', {}, true)).toEqual({ amount: 5, defense: 'resisted' });
    expect(damageAfterDefenses(11, 'fire', {})).toEqual({ amount: 11, defense: null });
    expect(conditionBlocked('poisoned', ['petrified'])).toBe(true);
    expect(conditionBlocked('poisoned', [])).toBe(false);
  });

  it('reckon the damage types: immune, then Resistance once, then Vulnerability', () => {
    // docs/adr/0048-hit-points.md §3.
    const dwarf = { resistances: ['poison'], immunities: ['psychic'] };
    expect(damageAfterDefenses(9, 'psychic', dwarf)).toEqual({ amount: 0, defense: 'immune' });
    expect(damageAfterDefenses(9, 'poison', dwarf, true)).toEqual({
      amount: 4,
      defense: 'resisted',
    });
    expect(damageAfterDefenses(7, 'bludgeoning', { vulnerabilities: ['bludgeoning'] })).toEqual({
      amount: 14,
      defense: 'vulnerable',
    });
    // Both: halved first, then doubled — 9 becomes 8.
    const both = { resistances: ['fire'], vulnerabilities: ['fire'] };
    expect(damageAfterDefenses(9, 'fire', both)).toEqual({ amount: 8, defense: 'resisted' });
  });

  it('turn an asked mode into the rolled one, cancelling, for the client to look up', () => {
    expect(modeAfter('advantage', checkEffects(['poisoned']))).toBe('normal');
    expect(modeAfter('normal', checkEffects(['poisoned']))).toBe('disadvantage');
    const modes = d20Modes(['restrained', 'poisoned'], 2);
    expect(modes.checks).toEqual({
      normal: 'disadvantage',
      advantage: 'normal',
      disadvantage: 'disadvantage',
    });
    expect(modes.saves.dex.normal).toBe('disadvantage');
    expect(modes.saves.wis.normal).toBe('normal');
    expect(modes.autoFail).toEqual([]);
    expect(modes.penalty).toBe(-4);
    expect(d20Modes(['stunned']).autoFail).toEqual(['str', 'dex']);
  });

  it('lose a level of Exhaustion to a long rest', () => {
    const sheet = { exhaustion: 2 } as unknown as CharacterSheet;
    const base = {
      hitPoints: { max: 10, current: 3 },
      spellSlots: { max: [0, 0, 0, 0, 0, 0, 0, 0, 0], expended: [0, 0, 0, 0, 0, 0, 0, 0, 0] },
      spellcasting: [],
      conditions: [],
    };
    expect(longRest({ ...base, ...sheet }).exhaustion).toBe(1);
    expect('exhaustion' in longRest({ ...base, exhaustion: 1 } as unknown as CharacterSheet)).toBe(
      false,
    );
  });
});
