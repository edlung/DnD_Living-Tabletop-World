import { randomInt } from 'node:crypto';

import type {
  CharacterSheet,
  Check,
  DieSides,
  RollGroup,
  RolledDie,
  RollMode,
} from '@ltw/contracts';
import { abilityModifier, savingThrowModifier, skillModifier } from '@ltw/rules';

/** Where the table's dice come from: the server's random numbers (tests script them). */
export interface DiceSource {
  /** A die of `sides` faces: 1 to `sides`. */
  roll(sides: number): number;
}

export const serverDice: DiceSource = { roll: (sides) => randomInt(1, sides + 1) };

/** Entered faces that do not fit the roll's dice: too few, too many, or off a die. */
export class EnteredFacesError extends Error {}

/**
 * The faces a player read off their own dice (docs/adr/0044-online-play.md §4), given out in the
 * roll's order; the rules compute every total from them as from the server's. A face that is not
 * on the die asked for, or one too few, throws; `spent` says no face was left over.
 */
export class EnteredDice implements DiceSource {
  readonly #faces: readonly number[];
  #next = 0;

  constructor(faces: readonly number[]) {
    this.#faces = faces;
  }

  roll(sides: number): number {
    const face = this.#faces[this.#next];
    this.#next += 1;
    if (face === undefined || !Number.isInteger(face) || face < 1 || face > sides) {
      throw new EnteredFacesError('an entered face does not fit its die');
    }
    return face;
  }

  get spent(): boolean {
    return this.#next === this.#faces.length;
  }
}

/** A free roll: each kind of die its count of times, plus the modifier. */
export function rollFreeDice(
  dice: DiceSource,
  kinds: readonly { readonly count: number; readonly sides: DieSides }[],
  modifier: number,
): RollGroup {
  const rolled: RolledDie[] = kinds.flatMap(({ count, sides }) =>
    Array.from({ length: count }, () => ({ sides, value: dice.roll(sides) })),
  );
  const total = rolled.reduce((sum, die) => sum + die.value, 0) + modifier;
  return { purpose: 'dice', dice: rolled, modifier, total };
}

/** A check's bonus from the canonical sheet by the rules (`@ltw/rules`); never the client's. */
export function checkModifier(sheet: CharacterSheet, check: Check): number {
  switch (check.kind) {
    case 'skill':
      return skillModifier(sheet, check.skill);
    case 'save':
      return savingThrowModifier(sheet, check.ability);
    case 'ability':
      return abilityModifier(sheet.abilities[check.ability]);
  }
}

/**
 * A d20 check for a character: two d20s with Advantage (the higher counts) or Disadvantage (the
 * lower). Whether it beat a requested DC is the DM's to know (the request's view), never the roll's.
 */
export function rollCheck(
  dice: DiceSource,
  sheet: CharacterSheet,
  check: Check,
  mode: RollMode,
): RollGroup {
  const modifier = checkModifier(sheet, check);
  const first = dice.roll(20);
  const dieOf = (value: number): RolledDie => ({ sides: 20, value });
  let rolled: RolledDie[] = [dieOf(first)];
  let kept = first;
  if (mode !== 'normal') {
    const second = dice.roll(20);
    const keepFirst = mode === 'advantage' ? first >= second : first <= second;
    kept = keepFirst ? first : second;
    rolled = keepFirst
      ? [dieOf(first), { sides: 20, value: second, dropped: true }]
      : [{ sides: 20, value: first, dropped: true }, dieOf(second)];
  }
  return {
    purpose: check.kind === 'save' ? 'save' : 'check',
    dice: rolled,
    modifier,
    total: kept + modifier,
  };
}
