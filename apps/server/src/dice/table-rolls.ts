import { randomInt } from 'node:crypto';

import type {
  CharacterSheet,
  Check,
  DieSides,
  RollGroup,
  RolledDie,
  RollMode,
} from '@ltw/contracts';
import {
  abilityModifier,
  checkEffects,
  modeAfter,
  saveEffects,
  savingThrowModifier,
  skillModifier,
} from '@ltw/rules';

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
 * The character's conditions on a check (docs/adr/0045-conditions-and-actions.md §1, §3): their
 * Advantage or Disadvantage joins the asked one and cancels as ADR 0011 says; Exhaustion lowers the
 * total; a save its conditions fail outright is said so.
 */
const effectsOf = (sheet: CharacterSheet, check: Check) =>
  check.kind === 'save'
    ? saveEffects(check.ability, sheet.conditions, sheet.exhaustion ?? 0, sheet.ordeal ?? 0)
    : checkEffects(sheet.conditions, sheet.exhaustion ?? 0, sheet.ordeal ?? 0);

/** The mode a check is rolled in: the asked one, the character's conditions counted. */
export const checkMode = (sheet: CharacterSheet, check: Check, asked: RollMode): RollMode =>
  modeAfter(asked, effectsOf(sheet, check));

/** A check's d20s in its mode: with Advantage the higher counts, with Disadvantage the lower. */
function d20s(
  mode: RollMode,
  first: number,
  second: number | undefined,
): { readonly dice: RolledDie[]; readonly kept: number } {
  const dieOf = (value: number, dropped = false): RolledDie =>
    dropped ? { sides: 20, value, dropped: true } : { sides: 20, value };
  if (mode === 'normal' || second === undefined) return { dice: [dieOf(first)], kept: first };
  const keepFirst = mode === 'advantage' ? first >= second : first <= second;
  return keepFirst
    ? { dice: [dieOf(first), dieOf(second, true)], kept: first }
    : { dice: [dieOf(first, true), dieOf(second)], kept: second };
}

/**
 * A d20 check for a character: two d20s with Advantage (the higher counts) or Disadvantage (the
 * lower). Whether it beat a requested DC is the DM's to know (the request's view), never the roll's.
 * A save its conditions fail outright keeps its die for the log.
 */
export function rollCheck(
  dice: DiceSource,
  sheet: CharacterSheet,
  check: Check,
  asked: RollMode,
): RollGroup {
  const effects = effectsOf(sheet, check);
  const mode = modeAfter(asked, effects);
  const modifier = checkModifier(sheet, check) + effects.penalty;
  const first = dice.roll(20);
  const { dice: rolled, kept } = d20s(mode, first, mode === 'normal' ? undefined : dice.roll(20));
  return {
    purpose: check.kind === 'save' ? 'save' : 'check',
    dice: rolled,
    modifier,
    total: kept + modifier,
    ...(effects.autoFail ? { result: 'failure' as const, autoFail: true as const } : {}),
  };
}

/**
 * Heroic Inspiration spent on a check (docs/adr/0046-reactions-beyond-counterspell.md §6): its
 * lowest d20 rolled again — the dropped one with Advantage, the kept one with Disadvantage, the one
 * a reroll can help — and the check counted anew in the mode it was rolled in, its modifier kept.
 * Null when the dice are not the mode's, or the check failed outright and no die can change it.
 */
export function rerollCheck(dice: DiceSource, group: RollGroup, mode: RollMode): RollGroup | null {
  const faces = group.dice.filter((die) => die.sides === 20).map((die) => die.value);
  const [one, two] = faces;
  if (
    group.autoFail === true ||
    one === undefined ||
    faces.length !== group.dice.length ||
    faces.length !== (mode === 'normal' ? 1 : 2)
  ) {
    return null;
  }
  const again = dice.roll(20);
  // The new die takes the lower one's place.
  const { dice: rolled, kept } =
    two === undefined
      ? d20s(mode, again, undefined)
      : one <= two
        ? d20s(mode, again, two)
        : d20s(mode, one, again);
  return {
    purpose: group.purpose,
    dice: rolled,
    modifier: group.modifier,
    total: kept + group.modifier,
  };
}
