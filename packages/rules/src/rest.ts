import {
  effectiveMaximum,
  type CharacterSheet,
  type ClassId,
  type HitDieSides,
} from '@ltw/contracts';

import { abilityModifier } from './character-math.ts';
import { afterLongRest } from './features/resources.ts';

/**
 * Rest (SRD 5.2.1; Stage 530, docs/PRODUCT_COMPLETION_PLAN.md decision 9): Hit Point Dice,
 * spending them in a short rest, and the long rest; a level is the builder's (`builder/level-up.ts`,
 * Stage 660). Pure functions over sheets; the server rolls the dice and the World Engine records the
 * sheets.
 */
export const CLASS_HIT_DIE: Readonly<Record<ClassId, HitDieSides>> = {
  ranger: 10,
  wizard: 6,
  fighter: 10,
  rogue: 8,
  cleric: 8,
  barbarian: 12,
  bard: 8,
  druid: 8,
  monk: 8,
  paladin: 10,
  sorcerer: 6,
  warlock: 8,
};

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
type Dropped =
  | 'hitDiceSpent'
  | 'deathSaves'
  | 'exhaustion'
  | 'knockedOut'
  | 'lastLongRestAt'
  | 'ordeal'
  | 'shape';

function without<K extends Dropped>(sheet: CharacterSheet, ...keys: K[]): Omit<CharacterSheet, K> {
  const dropped: readonly string[] = keys;
  return Object.fromEntries(
    Object.entries(sheet).filter(([name]) => !dropped.includes(name)),
  ) as Omit<CharacterSheet, K>;
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
  if (sheet.hitPoints.current >= effectiveMaximum(sheet.hitPoints)) return 'FULL_HIT_POINTS';
  return null;
}

/**
 * Spends one Hit Point Die of `sides` in a short rest: the die's roll plus the Constitution modifier
 * comes back as hit points, at least 1 (SRD 5.2.1), up to the maximum as an effect may have lowered
 * it. A character at 0 hit points is unconscious and spends none; a knocked-out one wakes with them
 * (docs/adr/0048-hit-points.md §4).
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
  const { current } = sheet.hitPoints;
  const modifier = abilityModifier(sheet.abilities.con);
  const healed = Math.min(
    effectiveMaximum(sheet.hitPoints) - current,
    Math.max(1, roll + modifier),
  );
  const spent: Spent = { ...(sheet.hitDiceSpent ?? {}), [KEY[sides]]: (pool?.spent ?? 0) + 1 };
  const rested = { ...sheet, hitPoints: { ...sheet.hitPoints, current: current + healed } };
  const awake =
    sheet.knockedOut === true
      ? {
          ...without(rested, 'knockedOut'),
          conditions: rested.conditions.filter((condition) => condition !== 'unconscious'),
        }
      : rested;
  return { sheet: withSpent(awake, spent), healed, modifier };
}

/**
 * A long rest (SRD 5.2.1): all hit points and all spent Hit Point Dice back, every spell slot and
 * free cast, death saves cleared and the Unconscious condition with them, temporary hit points gone
 * and a lowered maximum restored (docs/adr/0048-hit-points.md §1, §2), and one level of Exhaustion
 * fewer (docs/adr/0045-conditions-and-actions.md §3). The rules let a creature at 0 hit
 * points start no long rest; a stable one regains 1 after 1d4 hours, which the product counts
 * inside the eight, so the whole party wakes rested (owner-delegated decision, Stage 530). One
 * begun at `startedAt` (world time) is the one of these 24 hours (docs/adr/0050 §5). The class
 * features' uses come back, a Rage ends (docs/adr/0056-characters-from-the-srd.md §4), the
 * ordeal of one back from the dead eases by 1, and a Wild Shape's form ends (§5).
 */
export function longRest(sheet: CharacterSheet, startedAt?: number): CharacterSheet {
  const exhaustion = (sheet.exhaustion ?? 0) - 1;
  const ordeal = (sheet.ordeal ?? 0) - 1;
  return {
    ...without(
      afterLongRest(sheet),
      'deathSaves',
      'hitDiceSpent',
      'exhaustion',
      'ordeal',
      'knockedOut',
      // Wild Shape lasts hours, half the Druid's level: eight of them end it (ADR 0056 §5).
      'shape',
    ),
    ...(exhaustion > 0 ? { exhaustion } : {}),
    ...(ordeal > 0 ? { ordeal } : {}),
    ...(startedAt === undefined ? {} : { lastLongRestAt: startedAt }),
    hitPoints: { max: sheet.hitPoints.max, current: sheet.hitPoints.max },
    spellSlots: { max: [...sheet.spellSlots.max], expended: sheet.spellSlots.max.map(() => 0) },
    spellcasting: sheet.spellcasting.map((source) =>
      source.freeCasts ? { ...source, freeCasts: { ...source.freeCasts, used: 0 } } : source,
    ),
    conditions: sheet.conditions.filter((condition) => condition !== 'unconscious'),
  };
}

/** A day of world time, in seconds. */
export const DAY_SECONDS = 24 * 60 * 60;

/**
 * Why a character gains nothing from a Long Rest begun at `now` (SRD 5.2.1; docs/adr/0050 §5): one
 * began within the last 24 hours. One at 0 hit points comes round inside the eight (Stage 530).
 */
export function longRestRefusal(sheet: CharacterSheet, now: number): 'RESTED_TODAY' | null {
  return sheet.lastLongRestAt !== undefined && now - sheet.lastLongRestAt < DAY_SECONDS
    ? 'RESTED_TODAY'
    : null;
}

/**
 * A Short Rest's end (docs/adr/0048-hit-points.md §4; ADR 0050 §7): a knocked-out character comes
 * round with the hit points it has; null when it was not knocked out.
 */
export function wakeAfterShortRest(sheet: CharacterSheet): CharacterSheet | null {
  if (sheet.knockedOut !== true) return null;
  return {
    ...without(sheet, 'knockedOut'),
    conditions: sheet.conditions.filter((condition) => condition !== 'unconscious'),
  };
}

/**
 * Attacks per Attack action by class level (SRD 5.2.1): a Ranger's Extra Attack at 5; a Fighter's
 * at 5, Two Extra Attacks at 11, Three at 20. Several classes do not add up: the best counts.
 */
const EXTRA_ATTACKS: Partial<Record<ClassId, readonly (readonly [number, number])[]>> = {
  ranger: [[5, 2]],
  // Stage 660 (docs/adr/0056-characters-from-the-srd.md §3): the other martial classes' at 5.
  barbarian: [[5, 2]],
  monk: [[5, 2]],
  paladin: [[5, 2]],
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
