import type { MonsterAttack } from '@ltw/contracts';
import { describe, expect, it } from 'vitest';

import {
  attackCircumstances,
  checkMonsterAttack,
  damageAtZero,
  initiativeOrder,
  rollDeathSave,
  withinArea,
} from './combat.ts';
import { scriptedDice } from './dice.ts';

/** SRD 5.2.1 combat mechanics used by the slice (ADR 0015). */
const shortbow: MonsterAttack = {
  attackId: 'shortbow',
  name: 'Shortbow',
  kind: 'ranged',
  bonus: 4,
  normalRangeFt: 80,
  longRangeFt: 320,
  damage: { count: 1, sides: 6, bonus: 2, type: 'piercing' },
};
const scimitar: MonsterAttack = {
  attackId: 'scimitar',
  name: 'Scimitar',
  kind: 'melee',
  bonus: 4,
  reachFt: 5,
  damage: { count: 1, sides: 6, bonus: 2, type: 'slashing' },
};

describe('death saving throws', () => {
  const none = { successes: 0, failures: 0 };
  it.each([
    [10, { successes: 1, failures: 0 }, 'success'],
    [9, { successes: 0, failures: 1 }, 'failure'],
    [1, { successes: 0, failures: 2 }, 'failure'],
    [20, { successes: 0, failures: 0 }, 'revived'],
  ] as const)('a roll of %i from none gives %o (%s)', (roll, saves, outcome) => {
    expect(rollDeathSave(scriptedDice([roll]), none)).toEqual({ roll, saves, outcome });
  });

  it('stabilizes on the third success and dies on the third failure', () => {
    expect(rollDeathSave(scriptedDice([12]), { successes: 2, failures: 2 }).outcome).toBe('stable');
    expect(rollDeathSave(scriptedDice([1]), { successes: 2, failures: 2 }).outcome).toBe('dead');
  });

  it('counts damage at 0 HP as failures, and massive damage as death', () => {
    expect(damageAtZero({ successes: 2, failures: 0 }, 5, 78, false)).toEqual({
      saves: { successes: 0, failures: 1 },
      dead: false,
    });
    expect(damageAtZero({ successes: 0, failures: 1 }, 5, 78, true).dead).toBe(true);
    expect(damageAtZero({ successes: 0, failures: 0 }, 78, 78, false).dead).toBe(true);
  });
});

describe('attack circumstances', () => {
  const base = {
    attackerConditions: [],
    targetConditions: [],
    melee: false,
    distanceFt: 30,
    longRange: false,
  };
  it('gives ranged attacks against a prone target Disadvantage, melee within 5 ft Advantage', () => {
    expect(attackCircumstances({ ...base, targetConditions: ['prone'] })).toMatchObject({
      advantage: false,
      disadvantage: true,
    });
    expect(
      attackCircumstances({ ...base, targetConditions: ['prone'], melee: true, distanceFt: 5 }),
    ).toMatchObject({ advantage: true, disadvantage: false });
  });

  it('makes a close hit on an unconscious target critical', () => {
    expect(
      attackCircumstances({
        ...base,
        targetConditions: ['unconscious'],
        melee: true,
        distanceFt: 5,
      }),
    ).toEqual({ advantage: true, disadvantage: false, criticalOnHit: true });
    expect(attackCircumstances({ ...base, targetConditions: ['unconscious'] }).criticalOnHit).toBe(
      false,
    );
  });

  it('gives a prone attacker and long range Disadvantage', () => {
    expect(attackCircumstances({ ...base, attackerConditions: ['prone'] }).disadvantage).toBe(true);
    expect(attackCircumstances({ ...base, longRange: true }).disadvantage).toBe(true);
  });
});

describe('stat-block attacks', () => {
  it('uses reach for melee and range bands for ranged attacks', () => {
    expect(checkMonsterAttack(scimitar, 5, 'none')).toEqual({ legal: true, longRange: false });
    expect(checkMonsterAttack(scimitar, 10, 'none')).toEqual({
      legal: false,
      reason: 'OUT_OF_RANGE',
      resolution: { moveRequiredFt: 5 },
    });
    expect(checkMonsterAttack(shortbow, 80, 'half')).toEqual({ legal: true, longRange: false });
    expect(checkMonsterAttack(shortbow, 85, 'none')).toEqual({ legal: true, longRange: true });
    expect(checkMonsterAttack(shortbow, 325, 'none')).toMatchObject({ reason: 'OUT_OF_RANGE' });
    expect(checkMonsterAttack(shortbow, 30, 'total')).toMatchObject({ reason: 'TOTAL_COVER' });
  });
});

describe('areas and initiative', () => {
  it('includes every square within the radius, diagonals at 5 ft', () => {
    expect(withinArea({ x: 10, y: 10 }, { x: 14, y: 14 }, 20)).toBe(true);
    expect(withinArea({ x: 10, y: 10 }, { x: 15, y: 10 }, 20)).toBe(false);
  });

  it('orders by total, then Dexterity, then ID', () => {
    const order = initiativeOrder([
      { id: 'b', total: 15, dexterity: 14 },
      { id: 'a', total: 15, dexterity: 14 },
      { id: 'c', total: 15, dexterity: 18 },
      { id: 'd', total: 20, dexterity: 8 },
    ]);
    expect(order.map((entry) => entry.id)).toEqual(['d', 'c', 'a', 'b']);
  });
});
