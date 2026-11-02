import type { CharacterSheet, ClassId, HitDieSides } from '@ltw/contracts';

import { abilityModifier, spellSlotsFor, totalLevel } from './character-math.ts';

/**
 * Rest and progression (SRD 5.2.1; Stage 530, docs/PRODUCT_COMPLETION_PLAN.md decision 9): Hit Point
 * Dice, spending them in a short rest, the long rest, and a milestone level the DM grants. Pure
 * functions over sheets; the server rolls the dice and the World Engine records the sheets.
 */
export const CLASS_HIT_DIE: Readonly<Record<ClassId, HitDieSides>> = {
  ranger: 10,
  wizard: 6,
  fighter: 10,
  rogue: 8,
  cleric: 8,
};

/** A level's fixed hit points: the die's average rounded up (4, 5, 6, 7). */
const LEVEL_HP: Readonly<Record<HitDieSides, number>> = { 6: 4, 8: 5, 10: 6, 12: 7 };

type Spent = NonNullable<CharacterSheet['hitDiceSpent']>;
const KEY = { 6: 'd6', 8: 'd8', 10: 'd10', 12: 'd12' } as const satisfies Record<
  HitDieSides,
  keyof Spent
>;

export interface HitDicePool {
  readonly sides: HitDieSides;
  readonly total: number;
  readonly spent: number;
  readonly left: number;
}

/** The character's Hit Point Dice by size, largest first: one per level of each class. */
export function hitDice(sheet: CharacterSheet): HitDicePool[] {
  const totals = new Map<HitDieSides, number>();
  for (const entry of sheet.classes) {
    const sides = CLASS_HIT_DIE[entry.classId];
    totals.set(sides, (totals.get(sides) ?? 0) + entry.level);
  }
  return [...totals.entries()]
    .sort(([a], [b]) => b - a)
    .map(([sides, total]) => {
      const spent = Math.min(total, sheet.hitDiceSpent?.[KEY[sides]] ?? 0);
      return { sides, total, spent, left: total - spent };
    });
}

/** The sheet without one of its optional fields. */
function without<K extends 'hitDiceSpent' | 'deathSaves'>(
  sheet: CharacterSheet,
  key: K,
): Omit<CharacterSheet, K> {
  return Object.fromEntries(Object.entries(sheet).filter(([name]) => name !== key)) as Omit<
    CharacterSheet,
    K
  >;
}

/** The sheet with these spent Hit Point Dice; none spent leaves the field out. */
function withSpent(sheet: CharacterSheet, spent: Spent): CharacterSheet {
  const kept = Object.fromEntries(Object.entries(spent).filter(([, count]) => (count ?? 0) > 0));
  const rest = without(sheet, 'hitDiceSpent');
  return Object.keys(kept).length === 0 ? rest : { ...rest, hitDiceSpent: kept };
}

export type HitDieRefusal = 'NO_HIT_DICE_LEFT' | 'FULL_HIT_POINTS' | 'DOWN';

/** Why this character cannot spend a Hit Point Die of `sides` now, before any die is rolled. */
export function hitDieRefusal(sheet: CharacterSheet, sides: HitDieSides): HitDieRefusal | null {
  const pool = hitDice(sheet).find((entry) => entry.sides === sides);
  if (!pool || pool.left === 0) return 'NO_HIT_DICE_LEFT';
  if (sheet.hitPoints.current === 0) return 'DOWN';
  if (sheet.hitPoints.current >= sheet.hitPoints.max) return 'FULL_HIT_POINTS';
  return null;
}

/**
 * Spends one Hit Point Die of `sides` in a short rest: the die's roll plus the Constitution modifier
 * comes back as hit points, at least 1 (SRD 5.2.1), up to the maximum. A character at 0 hit points
 * is unconscious and spends none.
 */
export function spendHitDie(
  sheet: CharacterSheet,
  sides: HitDieSides,
  roll: number,
):
  | { readonly sheet: CharacterSheet; readonly healed: number; readonly modifier: number }
  | HitDieRefusal {
  const refusal = hitDieRefusal(sheet, sides);
  if (refusal) return refusal;
  const pool = hitDice(sheet).find((entry) => entry.sides === sides);
  const { current, max } = sheet.hitPoints;
  const modifier = abilityModifier(sheet.abilities.con);
  const healed = Math.min(max - current, Math.max(1, roll + modifier));
  const spent: Spent = { ...(sheet.hitDiceSpent ?? {}), [KEY[sides]]: (pool?.spent ?? 0) + 1 };
  return {
    sheet: withSpent({ ...sheet, hitPoints: { max, current: current + healed } }, spent),
    healed,
    modifier,
  };
}

/**
 * A long rest (SRD 5.2.1): all hit points and all spent Hit Point Dice back, every spell slot and
 * free cast, death saves cleared and the Unconscious condition with them. The rules let a creature
 * at 0 hit points start no long rest; a stable one regains 1 after 1d4 hours, which the product
 * counts inside the eight, so the whole party wakes rested (owner-delegated decision, Stage 530).
 */
export function longRest(sheet: CharacterSheet): CharacterSheet {
  return {
    ...without(without(sheet, 'deathSaves'), 'hitDiceSpent'),
    hitPoints: { max: sheet.hitPoints.max, current: sheet.hitPoints.max },
    spellSlots: { max: [...sheet.spellSlots.max], expended: sheet.spellSlots.max.map(() => 0) },
    spellcasting: sheet.spellcasting.map((source) =>
      source.freeCasts ? { ...source, freeCasts: { ...source.freeCasts, used: 0 } } : source,
    ),
    conditions: sheet.conditions.filter((condition) => condition !== 'unconscious'),
  };
}

export type LevelUpRefusal = 'NOT_A_CLASS_OF_THE_CHARACTER' | 'MAX_LEVEL';

/**
 * Attacks per Attack action by class level (SRD 5.2.1): a Ranger's Extra Attack at 5; a Fighter's
 * at 5, Two Extra Attacks at 11, Three at 20. Several classes do not add up: the best counts.
 */
const EXTRA_ATTACKS: Partial<Record<ClassId, readonly (readonly [number, number])[]>> = {
  ranger: [[5, 2]],
  fighter: [
    [5, 2],
    [11, 3],
    [20, 4],
  ],
};

export function attacksFor(classes: CharacterSheet['classes']): number {
  let attacks = 1;
  for (const entry of classes) {
    for (const [level, count] of EXTRA_ATTACKS[entry.classId] ?? []) {
      if (entry.level >= level) attacks = Math.max(attacks, count);
    }
  }
  return attacks;
}

/**
 * A milestone level in one of the character's classes: the level's fixed hit points plus the
 * Constitution modifier (at least 1), the spell slots for the new levels, and Extra Attack where the
 * class gains it (`attacksFor`). The proficiency bonus and every number that follows from the level are derived,
 * so they follow too. Features beyond these (new spells, subclass features) are the DM's to add.
 */
export function levelUp(sheet: CharacterSheet, classId: ClassId): CharacterSheet | LevelUpRefusal {
  if (!sheet.classes.some((entry) => entry.classId === classId)) {
    return 'NOT_A_CLASS_OF_THE_CHARACTER';
  }
  if (totalLevel(sheet) >= 20) return 'MAX_LEVEL';
  const classes = sheet.classes.map((entry) =>
    entry.classId === classId ? { ...entry, level: entry.level + 1 } : entry,
  );
  const gained = Math.max(
    1,
    LEVEL_HP[CLASS_HIT_DIE[classId]] + abilityModifier(sheet.abilities.con),
  );
  const slots = spellSlotsFor(classes);
  return {
    ...sheet,
    classes,
    hitPoints: { max: sheet.hitPoints.max + gained, current: sheet.hitPoints.current + gained },
    spellSlots: {
      max: slots,
      expended: slots.map((max, index) => Math.min(max, sheet.spellSlots.expended[index] ?? 0)),
    },
    attacksPerAction: Math.max(sheet.attacksPerAction, attacksFor(classes)),
  };
}
