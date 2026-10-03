import { describe, expect, it } from 'vitest';

import {
  beginAttackAction,
  checkWeaponAttack,
  resolveWeaponAttack,
  useAttack,
  type AttackContext,
} from './attacks.ts';
import { skillModifier } from './character-math.ts';
import {
  checkConcentrationAfterDamage,
  concentrationAfterConditions,
  concentrationSaveDc,
} from './concentration.ts';
import { attackRoll, d20Test, rollDamage } from './d20.ts';
import { scriptedDice } from './dice.ts';
import { applyHitPointChange, resolveCheck, resolveFireball, rollHealingWord } from './effects.ts';
import { distanceFt, moveRequiredFt, pathCostFt, type Position } from './grid.ts';
import { elowen, myTurn, theirTurn } from './testing/elowen.ts';
import { applyMove, checkMove } from './turn.ts';

const at = (x: number, y: number, elevationFt = 0): Position => ({ x, y, elevationFt });

describe('grid (5-ft squares, diagonals 5 ft)', () => {
  it('measures distance in squares, diagonals and elevation included', () => {
    expect(distanceFt(at(0, 0), at(3, 0))).toBe(15);
    expect(distanceFt(at(0, 0), at(3, 3))).toBe(15);
    expect(distanceFt(at(0, 0), at(1, 1, 20))).toBe(20);
    expect(moveRequiredFt(62, 60)).toBe(5);
    expect(moveRequiredFt(40, 60)).toBe(0);
  });

  it('prices paths step by step and rejects jumps', () => {
    expect(pathCostFt([at(0, 0), at(1, 1), at(2, 2)])).toEqual({ valid: true, costFt: 10 });
    expect(pathCostFt([at(0, 0), at(1, 0), at(2, 0)], (p) => p.x === 2)).toEqual({
      valid: true,
      costFt: 15,
    });
    expect(pathCostFt([at(0, 0), at(2, 0)])).toEqual({ valid: false, reason: 'INVALID_PATH' });
    expect(pathCostFt([at(0, 0), at(0.5, 0)])).toEqual({ valid: false, reason: 'INVALID_PATH' });
  });
});

describe('movement', () => {
  const line = (squares: number) => Array.from({ length: squares + 1 }, (_, x) => at(x, 0));

  it('allows up to Speed and not one square more', () => {
    expect(checkMove(elowen(), myTurn(), line(6))).toEqual({
      legal: true,
      costFt: 30,
      remainingFt: 0,
    });
    expect(checkMove(elowen(), myTurn(), line(7))).toEqual({
      legal: false,
      reason: 'NOT_ENOUGH_MOVEMENT',
    });
  });

  it('counts movement already used, difficult terrain, and Slowed', () => {
    const moved = applyMove(myTurn(), 20);
    expect(checkMove(elowen(), moved, line(2)).legal).toBe(true);
    expect(checkMove(elowen(), moved, line(3)).legal).toBe(false);
    expect(checkMove(elowen(), myTurn(), line(4), () => true)).toEqual({
      legal: false,
      reason: 'NOT_ENOUGH_MOVEMENT',
    });
    expect(checkMove(elowen({ conditions: ['slowed'] }), myTurn(), line(5)).legal).toBe(false);
  });

  it('forbids moving off-turn or while Incapacitated', () => {
    expect(checkMove(elowen(), theirTurn(), line(1))).toEqual({
      legal: false,
      reason: 'NOT_YOUR_TURN',
    });
    expect(checkMove(elowen({ conditions: ['incapacitated'] }), myTurn(), line(1))).toEqual({
      legal: false,
      reason: 'INCAPACITATED',
    });
  });
});

describe('Longbow attacks', () => {
  const base: AttackContext = { distanceFt: 60, targetAc: 15, cover: 'none' };
  const attackTurn = () => {
    const turn = beginAttackAction(elowen(), myTurn());
    if ('legal' in turn) throw new Error(turn.reason);
    return turn;
  };

  it('grants two attacks per Attack action (Extra Attack)', () => {
    let turn = attackTurn();
    expect(turn.attacksRemaining).toBe(2);
    turn = useAttack(useAttack(turn));
    expect(checkWeaponAttack(elowen(), turn, 'longbow', base)).toEqual({
      legal: false,
      reason: 'NO_ATTACKS_LEFT',
    });
    expect(beginAttackAction(elowen(), attackTurn())).toEqual({
      legal: false,
      reason: 'NO_ACTION',
    });
  });

  it('uses normal range, long range at Disadvantage, and nothing beyond', () => {
    expect(
      checkWeaponAttack(elowen(), attackTurn(), 'longbow', { ...base, distanceFt: 150 }),
    ).toMatchObject({ legal: true, disadvantage: false });
    expect(
      checkWeaponAttack(elowen(), attackTurn(), 'longbow', { ...base, distanceFt: 155 }),
    ).toMatchObject({ legal: true, disadvantage: true });
    expect(
      checkWeaponAttack(elowen(), attackTurn(), 'longbow', { ...base, distanceFt: 610 }),
    ).toEqual({
      legal: false,
      reason: 'OUT_OF_RANGE',
      resolution: { moveRequiredFt: 10 },
    });
  });

  it('adds cover to AC and refuses total cover', () => {
    expect(
      checkWeaponAttack(elowen(), attackTurn(), 'longbow', { ...base, cover: 'half' }),
    ).toMatchObject({ targetAc: 17 });
    expect(
      checkWeaponAttack(elowen(), attackTurn(), 'longbow', { ...base, cover: 'three-quarters' }),
    ).toMatchObject({ targetAc: 20 });
    expect(
      checkWeaponAttack(elowen(), attackTurn(), 'longbow', { ...base, cover: 'total' }),
    ).toEqual({ legal: false, reason: 'TOTAL_COVER' });
  });

  it('hits at +11, doubles every damage die on a natural 20, misses on a natural 1', () => {
    const context = { ...base, huntersMark: true };
    const plan = checkWeaponAttack(elowen(), attackTurn(), 'longbow', context);
    if (!plan.legal) throw new Error(plan.reason);
    const hit = resolveWeaponAttack(scriptedDice([4, 5, 3]), elowen(), 'longbow', plan, context);
    expect(hit.roll.total).toBe(15);
    expect(hit.damage?.total).toBe(9);
    expect(hit.huntersMarkDamage?.total).toBe(3);
    const crit = resolveWeaponAttack(
      scriptedDice([20, 8, 8, 6, 6]),
      elowen(),
      'longbow',
      plan,
      context,
    );
    expect([crit.roll.critical, crit.damage?.total, crit.huntersMarkDamage?.total]).toEqual([
      true,
      20,
      12,
    ]);
    const fumble = resolveWeaponAttack(
      scriptedDice([1]),
      elowen(),
      'longbow',
      { ...plan, targetAc: 2 },
      context,
    );
    expect(fumble.roll.success).toBe(false);
  });
});

describe('concentration', () => {
  it('uses DC max(10, half damage) capped at 30', () => {
    expect([0, 21, 22, 35, 60, 62, 200].map(concentrationSaveDc)).toEqual([
      10, 10, 11, 17, 30, 30, 30,
    ]);
  });

  it('keeps or loses Concentration on the Constitution save', () => {
    const marked = elowen({ concentration: { spellId: 'hunters-mark' } });
    expect(checkConcentrationAfterDamage(scriptedDice([8]), marked, 12)).toMatchObject({
      required: true,
      dc: 10,
      maintained: true,
    });
    expect(checkConcentrationAfterDamage(scriptedDice([7]), marked, 12)).toMatchObject({
      maintained: false,
    });
    expect(checkConcentrationAfterDamage(scriptedDice([]), elowen(), 12)).toEqual({
      required: false,
    });
  });

  it('ends on Incapacitated or 0 Hit Points', () => {
    const marked = elowen({ concentration: { spellId: 'hunters-mark' } });
    expect(concentrationAfterConditions({ ...marked, conditions: ['incapacitated'] })).toBeNull();
    expect(concentrationAfterConditions(applyHitPointChange(marked, -100))).toBeNull();
    expect(concentrationAfterConditions(marked)).toEqual({ spellId: 'hunters-mark' });
  });
});

describe('skill resolution and D20 tests', () => {
  it('resolves Perception (+12) and Investigation (+8) against a DC; ties succeed', () => {
    expect(
      resolveCheck(scriptedDice([3]), skillModifier(elowen(), 'perception'), 15),
    ).toMatchObject({ total: 15, success: true });
    expect(
      resolveCheck(scriptedDice([6]), skillModifier(elowen(), 'investigation'), 15),
    ).toMatchObject({ total: 14, success: false });
  });

  it('applies Advantage, Disadvantage, and their cancellation', () => {
    expect(
      d20Test(scriptedDice([4, 17]), { modifier: 0, target: 10, advantage: true }).natural,
    ).toBe(17);
    expect(
      d20Test(scriptedDice([4, 17]), { modifier: 0, target: 10, disadvantage: true }).natural,
    ).toBe(4);
    expect(
      d20Test(scriptedDice([9]), { modifier: 0, target: 10, advantage: true, disadvantage: true })
        .rolls,
    ).toEqual([9]);
  });

  it('gives natural 20 and 1 no special effect on checks, only on attacks', () => {
    expect(d20Test(scriptedDice([20]), { modifier: 0, target: 25 }).success).toBe(false);
    expect(d20Test(scriptedDice([1]), { modifier: 20, target: 15 }).success).toBe(true);
    expect(attackRoll(scriptedDice([20]), { modifier: 0, target: 30 })).toMatchObject({
      success: true,
      critical: true,
    });
  });

  it('rejects impossible scripted dice so tests cannot lie', () => {
    expect(() => rollDamage(scriptedDice([7]), 1, 6, 0)).toThrow(/not a valid d6/);
    expect(() => rollDamage(scriptedDice([]), 1, 6, 0)).toThrow(/exhausted/);
  });
});

describe('spell effects', () => {
  it('heals 2d4 + Wisdom with Healing Word, more with higher slots, never above max', () => {
    expect(rollHealingWord(scriptedDice([3, 4]), 1, 2).total).toBe(9);
    expect(rollHealingWord(scriptedDice([1, 1, 1, 1]), 2, 2).rolls).toHaveLength(4);
    expect(
      applyHitPointChange(elowen({ hitPoints: { max: 78, current: 75 } }), 9).hitPoints.current,
    ).toBe(78);
  });

  it('rolls Fireball damage once for everyone; successful Dexterity saves halve it', () => {
    const result = resolveFireball(scriptedDice([1, 2, 3, 4, 5, 6, 1, 2, 5, 18]), 3, 16, [
      { id: 'goblin-1', dexSaveModifier: 2 },
      { id: 'goblin-2', dexSaveModifier: 2 },
    ]);
    expect(result.damage.total).toBe(24);
    expect(result.results.map((r) => [r.id, r.damage])).toEqual([
      ['goblin-1', 24],
      ['goblin-2', 12],
    ]);
    expect(
      resolveFireball(scriptedDice(Array.from({ length: 10 }, () => 1)), 4, 16, [
        { id: 'g', dexSaveModifier: 0 },
      ]).damage.rolls,
    ).toHaveLength(9);
  });
});
