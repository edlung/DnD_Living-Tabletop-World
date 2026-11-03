import {
  ABILITIES,
  ROLL_MODES,
  type Ability,
  type Condition,
  type D20Modes,
  type RollMode,
} from '@ltw/contracts';

/**
 * What the conditions do (SRD 5.2.1; docs/adr/0045-conditions-and-actions.md §1, §3). Pure: a
 * creature's conditions and Exhaustion level in, their effect on a roll, its Speed or its turn
 * out. Advantage and Disadvantage from every source cancel where the roll is made (ADR 0011).
 */

/** The conditions that include Incapacitated. */
const INCAPACITATING: ReadonlySet<Condition> = new Set([
  'incapacitated',
  'paralyzed',
  'petrified',
  'stunned',
  'unconscious',
]);

/** Strength and Dexterity saving throws fail outright. */
const FAILS_STRENGTH_AND_DEXTERITY: ReadonlySet<Condition> = new Set([
  'paralyzed',
  'petrified',
  'stunned',
  'unconscious',
]);

/** Speed 0. */
const HELD_FAST: ReadonlySet<Condition> = new Set([
  'grappled',
  'paralyzed',
  'petrified',
  'restrained',
  'unconscious',
]);

/** Its own attack rolls have Disadvantage. */
const ATTACKS_WORSE: ReadonlySet<Condition> = new Set([
  'blinded',
  'frightened',
  'grappled',
  'poisoned',
  'prone',
  'restrained',
]);

/** Attack rolls against it have Advantage (Prone apart: it depends on the distance). */
const EXPOSED: ReadonlySet<Condition> = new Set([
  'blinded',
  'paralyzed',
  'petrified',
  'restrained',
  'stunned',
  'unconscious',
]);

const any = (conditions: readonly Condition[], set: ReadonlySet<Condition>) =>
  conditions.some((condition) => set.has(condition));

/** No action, Bonus Action or Reaction; Concentration ends (Incapacitated or what includes it). */
export const incapacitatedBy = (conditions: readonly Condition[]): boolean =>
  any(conditions, INCAPACITATING);

/** Every D20 Test loses 2 per Exhaustion level. */
export const exhaustionPenalty = (level: number): number => (level > 0 ? -2 * level : 0);

/**
 * Every D20 Test's penalty: Exhaustion's, and the ordeal of one back from the dead, −4 at first
 * (docs/adr/0056-characters-from-the-srd.md §5).
 */
export const d20Penalty = (exhaustion: number, ordeal = 0): number =>
  exhaustionPenalty(exhaustion) - ordeal;

/** Speed after conditions: 0 when held fast; Slowed 10 ft less; 5 ft less per Exhaustion level. */
export function speedAfterConditions(
  speedFt: number,
  conditions: readonly Condition[],
  exhaustion = 0,
): number {
  if (any(conditions, HELD_FAST)) return 0;
  const slowed = conditions.includes('slowed') ? 10 : 0;
  return Math.max(0, speedFt - slowed - 5 * exhaustion);
}

export interface RollEffects {
  /** The roll fails without a die (a save of a Paralyzed creature, say). */
  readonly autoFail: boolean;
  readonly advantage: boolean;
  readonly disadvantage: boolean;
  /** Added to the total: Exhaustion's −2 per level and an ordeal's, or 0. */
  readonly penalty: number;
}

/** A saving throw: Strength and Dexterity fail outright when held; Restrained worsens Dexterity. */
export function saveEffects(
  ability: Ability,
  conditions: readonly Condition[],
  exhaustion = 0,
  ordeal = 0,
): RollEffects {
  const physical = ability === 'str' || ability === 'dex';
  return {
    autoFail: physical && any(conditions, FAILS_STRENGTH_AND_DEXTERITY),
    advantage: false,
    disadvantage: ability === 'dex' && conditions.includes('restrained'),
    penalty: d20Penalty(exhaustion, ordeal),
  };
}

/** An ability check (an ability or a skill): Poisoned and Frightened give Disadvantage. */
export function checkEffects(
  conditions: readonly Condition[],
  exhaustion = 0,
  ordeal = 0,
): RollEffects {
  return {
    autoFail: false,
    advantage: false,
    disadvantage: conditions.includes('poisoned') || conditions.includes('frightened'),
    penalty: d20Penalty(exhaustion, ordeal),
  };
}

/** Initiative: Invisible gives Advantage, Incapacitated Disadvantage; Exhaustion lowers it. */
export function initiativeEffects(
  conditions: readonly Condition[],
  exhaustion = 0,
  ordeal = 0,
): RollEffects {
  return {
    autoFail: false,
    advantage: conditions.includes('invisible'),
    disadvantage: incapacitatedBy(conditions),
    penalty: d20Penalty(exhaustion, ordeal),
  };
}

/** The conditions that make the attacker's own attack rolls worse or better. */
export function attackerTilt(conditions: readonly Condition[]): {
  readonly advantage: boolean;
  readonly disadvantage: boolean;
} {
  return {
    advantage: conditions.includes('invisible'),
    disadvantage: any(conditions, ATTACKS_WORSE),
  };
}

/**
 * The target's conditions: Advantage when it is exposed, Disadvantage when Invisible, and a hit
 * from within 5 ft a Critical Hit when it is Paralyzed or Unconscious. Prone stays with the
 * distance rule of `attackCircumstances`.
 */
export function targetTilt(
  conditions: readonly Condition[],
  close: boolean,
): {
  readonly advantage: boolean;
  readonly disadvantage: boolean;
  readonly criticalOnHit: boolean;
} {
  return {
    advantage: any(conditions, EXPOSED),
    disadvantage: conditions.includes('invisible'),
    criticalOnHit:
      close && (conditions.includes('paralyzed') || conditions.includes('unconscious')),
  };
}

/** Resistance, Vulnerability and Immunity by damage type (docs/adr/0048-hit-points.md §3). */
export interface DamageDefenses {
  readonly resistances?: readonly string[] | undefined;
  readonly vulnerabilities?: readonly string[] | undefined;
  readonly immunities?: readonly string[] | undefined;
}

/**
 * Damage after a creature's defenses (SRD 5.2.1): none if it is immune to the type; Resistance
 * halves it (rounded down), then Vulnerability doubles it; two Resistances count once. Petrified
 * resists every type (`resistsAll`). Which defense changed it, if any did.
 */
export function damageAfterDefenses(
  damage: number,
  type: string,
  defenses: DamageDefenses,
  resistsAll = false,
): { readonly amount: number; readonly defense: 'resisted' | 'vulnerable' | 'immune' | null } {
  if (defenses.immunities?.includes(type) === true) return { amount: 0, defense: 'immune' };
  const resisted = resistsAll || defenses.resistances?.includes(type) === true;
  const halved = resisted ? Math.floor(damage / 2) : damage;
  const amount = defenses.vulnerabilities?.includes(type) === true ? halved * 2 : halved;
  return {
    amount,
    defense: amount < damage ? 'resisted' : amount > damage ? 'vulnerable' : null,
  };
}

/** A condition that cannot take hold: a Petrified creature cannot be Poisoned. */
export const conditionBlocked = (condition: Condition, conditions: readonly Condition[]): boolean =>
  condition === 'poisoned' && conditions.includes('petrified');

/** The mode a d20 roll takes: the asked one joined by the conditions', cancelling (ADR 0011). */
export function modeAfter(asked: RollMode, effects: RollEffects): RollMode {
  const advantage = asked === 'advantage' || effects.advantage;
  const disadvantage = asked === 'disadvantage' || effects.disadvantage;
  if (advantage === disadvantage) return 'normal';
  return advantage ? 'advantage' : 'disadvantage';
}

const modesFor = (effects: RollEffects): Readonly<Record<RollMode, RollMode>> =>
  Object.fromEntries(ROLL_MODES.map((asked) => [asked, modeAfter(asked, effects)])) as Record<
    RollMode,
    RollMode
  >;

/**
 * For each asked mode, the one a character's ability check and each saving throw take under its
 * conditions, the saves they fail outright and Exhaustion's penalty (ADR 0045 §1, §3): lookups
 * the server hands the client, which never combines them itself.
 */
export function d20Modes(conditions: readonly Condition[], exhaustion = 0, ordeal = 0): D20Modes {
  return {
    checks: modesFor(checkEffects(conditions, exhaustion)),
    saves: Object.fromEntries(
      ABILITIES.map((ability) => [ability, modesFor(saveEffects(ability, conditions, exhaustion))]),
    ) as D20Modes['saves'],
    autoFail: ABILITIES.filter((ability) => saveEffects(ability, conditions).autoFail),
    penalty: d20Penalty(exhaustion, ordeal),
  };
}
