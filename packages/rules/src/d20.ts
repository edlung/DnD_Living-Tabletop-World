import { rollDice, sum, type Dice } from './dice.ts';

/**
 * D20 Tests (SRD 5.2.1): ability checks, saving throws, attack rolls.
 * Advantage and Disadvantage cancel when both apply. Only attack rolls treat
 * a natural 20 (Critical Hit) and natural 1 (miss) specially.
 */
export interface D20Options {
  readonly modifier: number;
  readonly target: number;
  readonly advantage?: boolean;
  readonly disadvantage?: boolean;
}

export interface D20Result {
  readonly rolls: readonly number[];
  readonly natural: number;
  readonly total: number;
  readonly success: boolean;
}

function rollD20(
  dice: Dice,
  advantage: boolean,
  disadvantage: boolean,
): { rolls: number[]; natural: number } {
  if (advantage === disadvantage) {
    const rolls = rollDice(dice, 1, 20);
    return { rolls, natural: rolls[0] ?? 1 };
  }
  const rolls = rollDice(dice, 2, 20);
  return { rolls, natural: advantage ? Math.max(...rolls) : Math.min(...rolls) };
}

/** Ability check or saving throw: success when the total meets or beats the DC. */
export function d20Test(dice: Dice, options: D20Options): D20Result {
  const { rolls, natural } = rollD20(
    dice,
    options.advantage ?? false,
    options.disadvantage ?? false,
  );
  const total = natural + options.modifier;
  return { rolls, natural, total, success: total >= options.target };
}

export interface AttackRollResult extends D20Result {
  readonly critical: boolean;
}

/** Attack roll against an AC: natural 20 always hits (Critical Hit), natural 1 always misses. */
export function attackRoll(dice: Dice, options: D20Options): AttackRollResult {
  const { rolls, natural } = rollD20(
    dice,
    options.advantage ?? false,
    options.disadvantage ?? false,
  );
  const total = natural + options.modifier;
  const critical = natural === 20;
  const success = critical || (natural !== 1 && total >= options.target);
  return { rolls, natural, total, success, critical };
}

export interface DamageRoll {
  readonly rolls: readonly number[];
  readonly total: number;
}

/** Rolls `count`d`sides` + modifier; a Critical Hit rolls the dice twice (SRD 5.2.1). */
export function rollDamage(
  dice: Dice,
  count: number,
  sides: number,
  modifier: number,
  critical = false,
): DamageRoll {
  const rolls = rollDice(dice, critical ? count * 2 : count, sides);
  return { rolls, total: Math.max(0, sum(rolls) + modifier) };
}
