import type { CharacterSheet, WeaponId } from '@ltw/contracts';

import { WEAPONS } from './catalog.ts';
import { modifierOf, proficiencyBonus, totalLevel } from './character-math.ts';
import { attackRoll, rollDamage, type AttackRollResult, type DamageRoll } from './d20.ts';
import type { Dice } from './dice.ts';
import { moveRequiredFt } from './grid.ts';
import { illegal, isIncapacitated, type Illegal, type TurnState } from './turn.ts';

/**
 * Weapon attacks (SRD 5.2.1): range bands (normal, long at Disadvantage),
 * cover (+2 / +5 AC, total cover blocks), Archery (+2 ranged), Extra Attack,
 * Critical Hits doubling every damage die, Hunter's Mark +1d6 Force.
 */
export type Cover = 'none' | 'half' | 'three-quarters' | 'total';
const COVER_AC: Record<Exclude<Cover, 'total'>, number> = { none: 0, half: 2, 'three-quarters': 5 };

export function weaponAttackBonus(sheet: CharacterSheet, weaponId: WeaponId): number {
  const weapon = WEAPONS[weaponId];
  const archery = weapon.ranged && sheet.fightingStyle === 'archery' ? 2 : 0;
  return modifierOf(sheet, weapon.ability) + proficiencyBonus(totalLevel(sheet)) + archery;
}

/** Taking the Attack action grants `attacksPerAction` attacks (Extra Attack). */
export function beginAttackAction(sheet: CharacterSheet, turn: TurnState): TurnState | Illegal {
  if (isIncapacitated(sheet)) return illegal('INCAPACITATED');
  if (!turn.ownTurn) return illegal('NOT_YOUR_TURN');
  if (turn.actionUsed) return illegal('NO_ACTION');
  return { ...turn, actionUsed: true, attacksRemaining: sheet.attacksPerAction };
}

export interface AttackContext {
  readonly distanceFt: number;
  readonly targetAc: number;
  readonly cover: Cover;
  readonly advantage?: boolean;
  readonly disadvantage?: boolean;
  readonly huntersMark?: boolean;
}

export type AttackPlan =
  | {
      readonly legal: true;
      readonly attackBonus: number;
      readonly targetAc: number;
      readonly disadvantage: boolean;
    }
  | Illegal;

export function checkWeaponAttack(
  sheet: CharacterSheet,
  turn: TurnState,
  weaponId: WeaponId,
  context: AttackContext,
): AttackPlan {
  if (!sheet.weapons.includes(weaponId)) return illegal('NO_WEAPON');
  if (turn.attacksRemaining <= 0) return illegal('NO_ATTACKS_LEFT');
  const weapon = WEAPONS[weaponId];
  if (context.distanceFt > weapon.longRangeFt) {
    return illegal('OUT_OF_RANGE', {
      moveRequiredFt: moveRequiredFt(context.distanceFt, weapon.longRangeFt),
    });
  }
  if (context.cover === 'total') return illegal('TOTAL_COVER');
  return {
    legal: true,
    attackBonus: weaponAttackBonus(sheet, weaponId),
    targetAc: context.targetAc + COVER_AC[context.cover],
    disadvantage: (context.disadvantage ?? false) || context.distanceFt > weapon.normalRangeFt,
  };
}

export interface AttackOutcome {
  readonly roll: AttackRollResult;
  readonly damage: DamageRoll | null;
  readonly huntersMarkDamage: DamageRoll | null;
}

export function resolveWeaponAttack(
  dice: Dice,
  sheet: CharacterSheet,
  weaponId: WeaponId,
  plan: Extract<AttackPlan, { legal: true }>,
  context: AttackContext,
): AttackOutcome {
  const weapon = WEAPONS[weaponId];
  const roll = attackRoll(dice, {
    modifier: plan.attackBonus,
    target: plan.targetAc,
    advantage: context.advantage ?? false,
    disadvantage: plan.disadvantage,
  });
  if (!roll.success) return { roll, damage: null, huntersMarkDamage: null };
  const damage = rollDamage(
    dice,
    weapon.damageDice.count,
    weapon.damageDice.sides,
    modifierOf(sheet, weapon.ability),
    roll.critical,
  );
  const huntersMarkDamage = context.huntersMark ? rollDamage(dice, 1, 6, 0, roll.critical) : null;
  return { roll, damage, huntersMarkDamage };
}

export function useAttack(turn: TurnState): TurnState {
  return { ...turn, attacksRemaining: Math.max(0, turn.attacksRemaining - 1) };
}
