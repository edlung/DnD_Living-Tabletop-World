/**
 * Randomness enters the rules only through `Dice` (docs/adr/0011-ruleset-srd-5-2.md).
 * Rules never call a random number generator; every resolver returns the
 * die results it used so they can be recorded and replayed.
 */
export interface Dice {
  /** One roll of a die with `sides` faces, from 1 to `sides`. */
  roll(sides: number): number;
}

/** Deterministic dice for tests and replay: returns the given values in order. */
export function scriptedDice(values: readonly number[]): Dice & { readonly remaining: number } {
  let index = 0;
  return {
    roll(sides) {
      const value = values[index];
      if (value === undefined)
        throw new Error(`scripted dice exhausted after ${String(index)} rolls`);
      if (!Number.isInteger(value) || value < 1 || value > sides) {
        throw new Error(`scripted value ${String(value)} is not a valid d${String(sides)} result`);
      }
      index += 1;
      return value;
    },
    get remaining() {
      return values.length - index;
    },
  };
}

/** Rolls `count` dice of `sides` faces and returns each result. */
export function rollDice(dice: Dice, count: number, sides: number): number[] {
  return Array.from({ length: count }, () => dice.roll(sides));
}

export const sum = (values: readonly number[]): number => values.reduce((a, b) => a + b, 0);
