import {
  effectiveMaximum,
  type Ability,
  type CharacterSheet,
  type Condition,
  type CreatureSize,
  type DamageType,
  type HitPoints,
  type Speeds,
  type StatBlock,
} from '@ltw/contracts';
import { campaignOptions, carriedWeightLb } from '@ltw/domain';
import type { Dice, DraftEvent, WorldState } from '@ltw/domain';
import {
  abilityModifier,
  d20Penalty,
  formOf,
  incapacitatedBy,
  initiativeAdvantage,
  initiativeEffects,
  loadSpeedFt,
  resistancesOf,
  savingThrowModifier,
  speedAfterConditions,
  walkingSpeedFt,
} from '@ltw/rules';

/**
 * One view of a combatant's statistics and current vitals, whether a
 * character (sheet, ADR 0011) or a creature (stat block, ADR 0015). Vitals
 * change only by emitting the full new value (`vitalsEvent`). A character's
 * load caps its speed where the campaign enforces carrying (ADR 0056 §3).
 */
export type Vitals =
  | {
      readonly kind: 'character';
      readonly entityId: string;
      readonly sheet: CharacterSheet;
      readonly loadSpeedFt?: number;
      /**
       * Wild Shape's Beast form while the Druid wears it (docs/adr/0056-…md §5): its Armor Class,
       * Strength, Dexterity and Constitution, size, speeds, senses, defenses and attacks.
       */
      readonly form?: StatBlock;
    }
  | { readonly kind: 'creature'; readonly entityId: string; readonly block: StatBlock };

export function vitalsOf(state: WorldState, entityId: string): Vitals | null {
  const entity = state.entities.get(entityId);
  if (!entity) return null;
  if (entity.kind === 'character') {
    const sheet = state.characterSheets.get(entityId);
    if (!sheet) return null;
    const load =
      campaignOptions(state).carrying === 'enforced'
        ? loadSpeedFt(sheet, carriedWeightLb(state, entityId))
        : null;
    const form = formOf(sheet);
    return {
      kind: 'character',
      entityId,
      sheet,
      ...(load === null ? {} : { loadSpeedFt: load }),
      ...(form ? { form } : {}),
    };
  }
  const block = state.statBlocks.get(entityId);
  return block ? { kind: 'creature', entityId, block } : null;
}

export const hitPoints = (v: Vitals): HitPoints =>
  v.kind === 'character' ? v.sheet.hitPoints : v.block.hitPoints;
/** Its hit point maximum as an effect may have lowered it (docs/adr/0048-hit-points.md §2). */
export const ceilingOf = (v: Vitals): number => effectiveMaximum(hitPoints(v));
/**
 * Its Resistances, Vulnerabilities and Immunities by damage type (ADR 0048 §3): a raging
 * character's resistances among them (docs/adr/0056-characters-from-the-srd.md §4).
 */
export const defensesOf = (v: Vitals) => {
  if (v.kind === 'creature') return v.block;
  const own = v.sheet.raging ? { ...v.sheet, resistances: [...resistancesOf(v.sheet)] } : v.sheet;
  if (!v.form) return own;
  // A Wild Shape's form adds its own (docs/adr/0056-…md §5).
  const both = (a?: readonly DamageType[], b?: readonly DamageType[]) => [
    ...new Set([...(a ?? []), ...(b ?? [])]),
  ];
  return {
    resistances: both(own.resistances, v.form.resistances),
    vulnerabilities: both(own.vulnerabilities, v.form.vulnerabilities),
    immunities: both(own.immunities, v.form.immunities),
  };
};
/** The block whose body the creature has: its own, or a Druid's Wild Shape form. */
const bodyOf = (v: Vitals): StatBlock | null =>
  v.kind === 'creature' ? v.block : (v.form ?? null);
/** Its size (docs/adr/0049-space-and-movement.md §1): Medium when its sheet or block names none. */
export const sizeOf = (v: Vitals): CreatureSize => {
  const body = bodyOf(v);
  return (body ? body.size : v.kind === 'character' ? v.sheet.size : undefined) ?? 'medium';
};
/** Its speeds beside walking (ADR 0049 §5): none when its sheet or block names none. */
export const speedsOf = (v: Vitals): Speeds => {
  const body = bodyOf(v);
  return (body ? body.speeds : v.kind === 'character' ? v.sheet.speeds : undefined) ?? {};
};

/** The ways a creature moves (ADR 0049 §5): on foot, by air, swimming, climbing, underground. */
export type Way = 'walk' | 'fly' | 'swim' | 'climb' | 'burrow';

/**
 * Its speed for a way of moving (ADR 0049 §5): the way's own speed, else its walking one (climbing
 * and swimming at a cost; flying and burrowing not at all), lowered as its walking speed is.
 */
export function wayOfSpeed(v: Vitals, way: Way): number {
  const walking = speedOf(v);
  if (walking === 0) return 0;
  const lowered = baseSpeedOf(v) - walking;
  const speeds = speedsOf(v);
  const own = way === 'walk' ? baseSpeedOf(v) : speeds[way];
  if (own === undefined) return way === 'swim' || way === 'climb' ? walking : 0;
  return Math.min(loadOf(v), Math.max(0, own - lowered));
}
export const armorClass = (v: Vitals) =>
  bodyOf(v)?.armorClass ?? (v.kind === 'character' ? v.sheet.armorClass : 0);
export const conditionsOf = (v: Vitals): readonly Condition[] =>
  v.kind === 'character' ? v.sheet.conditions : v.block.conditions;
export const has = (v: Vitals, condition: Condition) => conditionsOf(v).includes(condition);
/** Incapacitated, or a condition that includes it (docs/adr/0045-conditions-and-actions.md §1). */
export const incapacitated = (v: Vitals) => incapacitatedBy(conditionsOf(v));
/** Exhaustion's level (ADR 0045 §3); 0 when none. */
export const exhaustionOf = (v: Vitals): number =>
  (v.kind === 'character' ? v.sheet.exhaustion : v.block.exhaustion) ?? 0;
/** The ordeal of a character back from the dead (docs/adr/0056-characters-from-the-srd.md §5). */
export const ordealOf = (v: Vitals): number => (v.kind === 'character' ? (v.sheet.ordeal ?? 0) : 0);
/** Every D20 Test's penalty: Exhaustion's and an ordeal's (ADR 0045 §3; ADR 0056 §5). */
export const d20PenaltyOf = (v: Vitals): number => d20Penalty(exhaustionOf(v), ordealOf(v));
export const dexterity = (v: Vitals) =>
  (bodyOf(v) ?? (v.kind === 'character' ? v.sheet : v.block)).abilities.dex;
export const initiativeModifier = (v: Vitals) =>
  v.kind === 'character' ? abilityModifier(dexterity(v)) : v.block.initiativeBonus;

/**
 * Initiative (SRD 5.2.1; docs/adr/0045-conditions-and-actions.md §1): an Invisible creature rolls
 * twice and keeps the higher, an Incapacitated one the lower; Exhaustion lowers the modifier.
 */
/**
 * Initiative with the creature's conditions and Exhaustion (ADR 0045 §1, §3); a creature surprised
 * as the fight starts rolls it with Disadvantage (§5, SRD 5.2.1).
 */
export function rollInitiative(
  dice: Dice,
  v: Vitals,
  surprised = false,
): { roll: number; modifier: number } {
  const effects = initiativeEffects(conditionsOf(v), exhaustionOf(v), ordealOf(v));
  const disadvantage = effects.disadvantage || surprised;
  // Feral Instinct and Remarkable Athlete (docs/adr/0056-characters-from-the-srd.md §4).
  const advantage = effects.advantage || (v.kind === 'character' && initiativeAdvantage(v.sheet));
  const first = dice.roll(20);
  let roll = first;
  if (advantage !== disadvantage) {
    const second = dice.roll(20);
    roll = advantage ? Math.max(first, second) : Math.min(first, second);
  }
  return { roll, modifier: initiativeModifier(v) + effects.penalty };
}
export function saveModifier(v: Vitals, ability: Ability): number {
  if (v.kind === 'creature') return v.block.savingThrows[ability];
  const form = v.form;
  if (!form || (ability !== 'str' && ability !== 'dex' && ability !== 'con'))
    return savingThrowModifier(v.sheet, ability);
  // In a form: its score with the Druid's own proficiency, or the form's save where higher.
  const shaped = {
    ...v.sheet,
    abilities: { ...v.sheet.abilities, [ability]: form.abilities[ability] },
  };
  return Math.max(savingThrowModifier(shaped, ability), form.savingThrows[ability]);
}

/** Walking speed before conditions: a character's with its class's movement (ADR 0056 §4). */
export const baseSpeedOf = (v: Vitals): number =>
  bodyOf(v)?.speedFt ?? (v.kind === 'character' ? walkingSpeedFt(v.sheet) : 0);

/** The most its load lets it move (ADR 0056 §3); no limit when it carries it all. */
const loadOf = (v: Vitals): number =>
  v.kind === 'character' ? (v.loadSpeedFt ?? Number.POSITIVE_INFINITY) : Number.POSITIVE_INFINITY;

/** Speed after conditions and Exhaustion (ADR 0015; ADR 0045 §1, §3), and its load (ADR 0056 §3). */
export function speedOf(v: Vitals): number {
  return Math.min(
    loadOf(v),
    speedAfterConditions(baseSpeedOf(v), conditionsOf(v), exhaustionOf(v)),
  );
}

export function withHitPoints(v: Vitals, current: number): Vitals {
  return withAllHitPoints(v, { ...hitPoints(v), current });
}

/** Its whole hit points replaced: temporary ones and a lowered maximum with them (ADR 0048). */
export function withAllHitPoints(v: Vitals, next: HitPoints): Vitals {
  const hp: HitPoints = { max: next.max, current: next.current };
  const whole: HitPoints = {
    ...hp,
    ...(next.temporary !== undefined && next.temporary > 0 ? { temporary: next.temporary } : {}),
    ...(next.reducedBy !== undefined && next.reducedBy > 0 ? { reducedBy: next.reducedBy } : {}),
  };
  return v.kind === 'character'
    ? { ...v, sheet: { ...v.sheet, hitPoints: whole } }
    : { ...v, block: { ...v.block, hitPoints: whole } };
}

/** A condition its stat block is immune to (docs/adr/0053-monsters-as-data.md §1). */
export const conditionImmune = (v: Vitals, condition: Condition): boolean =>
  (bodyOf(v)?.conditionImmunities ?? []).includes(condition);

export function withConditions(
  v: Vitals,
  add: readonly Condition[],
  remove: readonly Condition[],
): Vitals {
  // A condition it is immune to never takes hold.
  const taken = add.filter((condition) => !conditionImmune(v, condition));
  const next = [...new Set([...conditionsOf(v).filter((c) => !remove.includes(c)), ...taken])];
  // Awake, it is knocked out no longer (docs/adr/0048-hit-points.md §4).
  const kept = withKnockedOut(v, knockedOutOf(v) && next.includes('unconscious'));
  return kept.kind === 'character'
    ? { ...kept, sheet: { ...kept.sheet, conditions: next } }
    : { ...kept, block: { ...kept.block, conditions: next } };
}

/** Knocked out by a melee attack: Unconscious at 1 hit point (ADR 0048 §4). */
export const knockedOutOf = (v: Vitals): boolean =>
  (v.kind === 'character' ? v.sheet.knockedOut : v.block.knockedOut) === true;

/** The knocked-out mark set or cleared; cleared leaves the field absent. */
export function withKnockedOut(v: Vitals, on: boolean): Vitals {
  if (v.kind === 'character') {
    const sheet = { ...v.sheet };
    if (on) sheet.knockedOut = true;
    else delete sheet.knockedOut;
    return { ...v, sheet };
  }
  const block = { ...v.block };
  if (on) block.knockedOut = true;
  else delete block.knockedOut;
  return { ...v, block };
}

/** Exhaustion's level set; 0 leaves the field absent, as on a sheet that never had it. */
export function withExhaustion(v: Vitals, level: number): Vitals {
  if (v.kind === 'character') {
    const sheet = { ...v.sheet };
    if (level > 0) sheet.exhaustion = level;
    else delete sheet.exhaustion;
    return { ...v, sheet };
  }
  const block = { ...v.block };
  if (level > 0) block.exhaustion = level;
  else delete block.exhaustion;
  return { ...v, block };
}

export function withSheet(v: Vitals, change: (sheet: CharacterSheet) => CharacterSheet): Vitals {
  return v.kind === 'character' ? { ...v, sheet: change(v.sheet) } : v;
}

/** A character no longer dying: its death saving throws reset (SRD 5.2.1). */
export function withoutDeathSaves(v: Vitals): Vitals {
  return withSheet(v, (sheet) => {
    const next = { ...sheet };
    delete next.deathSaves;
    return next;
  });
}

/** The event that records a combatant's new vitals. */
export function vitalsEvent(v: Vitals): DraftEvent {
  return v.kind === 'character'
    ? { type: 'CharacterSheetSet', payload: { entityId: v.entityId, sheet: v.sheet } }
    : { type: 'StatBlockSet', payload: { entityId: v.entityId, statBlock: v.block } };
}
