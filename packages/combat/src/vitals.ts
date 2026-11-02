import type { Ability, CharacterSheet, Condition, StatBlock } from '@ltw/contracts';
import type { Dice, DraftEvent, WorldState } from '@ltw/domain';
import {
  abilityModifier,
  incapacitatedBy,
  initiativeEffects,
  savingThrowModifier,
  speedAfterConditions,
} from '@ltw/rules';

/**
 * One view of a combatant's statistics and current vitals, whether a
 * character (sheet, ADR 0011) or a creature (stat block, ADR 0015). Vitals
 * change only by emitting the full new value (`vitalsEvent`).
 */
export type Vitals =
  | { readonly kind: 'character'; readonly entityId: string; readonly sheet: CharacterSheet }
  | { readonly kind: 'creature'; readonly entityId: string; readonly block: StatBlock };

export function vitalsOf(state: WorldState, entityId: string): Vitals | null {
  const entity = state.entities.get(entityId);
  if (!entity) return null;
  if (entity.kind === 'character') {
    const sheet = state.characterSheets.get(entityId);
    return sheet ? { kind: 'character', entityId, sheet } : null;
  }
  const block = state.statBlocks.get(entityId);
  return block ? { kind: 'creature', entityId, block } : null;
}

export const hitPoints = (v: Vitals) =>
  v.kind === 'character' ? v.sheet.hitPoints : v.block.hitPoints;
export const armorClass = (v: Vitals) =>
  v.kind === 'character' ? v.sheet.armorClass : v.block.armorClass;
export const conditionsOf = (v: Vitals): readonly Condition[] =>
  v.kind === 'character' ? v.sheet.conditions : v.block.conditions;
export const has = (v: Vitals, condition: Condition) => conditionsOf(v).includes(condition);
/** Incapacitated, or a condition that includes it (docs/adr/0045-conditions-and-actions.md §1). */
export const incapacitated = (v: Vitals) => incapacitatedBy(conditionsOf(v));
/** Exhaustion's level (ADR 0045 §3); 0 when none. */
export const exhaustionOf = (v: Vitals): number =>
  (v.kind === 'character' ? v.sheet.exhaustion : v.block.exhaustion) ?? 0;
export const dexterity = (v: Vitals) =>
  v.kind === 'character' ? v.sheet.abilities.dex : v.block.abilities.dex;
export const initiativeModifier = (v: Vitals) =>
  v.kind === 'character' ? abilityModifier(v.sheet.abilities.dex) : v.block.initiativeBonus;

/**
 * Initiative (SRD 5.2.1; docs/adr/0045-conditions-and-actions.md §1): an Invisible creature rolls
 * twice and keeps the higher, an Incapacitated one the lower; Exhaustion lowers the modifier.
 */
export function rollInitiative(dice: Dice, v: Vitals): { roll: number; modifier: number } {
  const effects = initiativeEffects(conditionsOf(v), exhaustionOf(v));
  const first = dice.roll(20);
  let roll = first;
  if (effects.advantage !== effects.disadvantage) {
    const second = dice.roll(20);
    roll = effects.advantage ? Math.max(first, second) : Math.min(first, second);
  }
  return { roll, modifier: initiativeModifier(v) + effects.penalty };
}
export const saveModifier = (v: Vitals, ability: Ability) =>
  v.kind === 'character' ? savingThrowModifier(v.sheet, ability) : v.block.savingThrows[ability];

/** Speed after conditions and Exhaustion (ADR 0015; ADR 0045 §1, §3). */
export function speedOf(v: Vitals): number {
  const base = v.kind === 'character' ? v.sheet.speedFt : v.block.speedFt;
  return speedAfterConditions(base, conditionsOf(v), exhaustionOf(v));
}

export function withHitPoints(v: Vitals, current: number): Vitals {
  return v.kind === 'character'
    ? { ...v, sheet: { ...v.sheet, hitPoints: { ...v.sheet.hitPoints, current } } }
    : { ...v, block: { ...v.block, hitPoints: { ...v.block.hitPoints, current } } };
}

export function withConditions(
  v: Vitals,
  add: readonly Condition[],
  remove: readonly Condition[],
): Vitals {
  const next = [...new Set([...conditionsOf(v).filter((c) => !remove.includes(c)), ...add])];
  return v.kind === 'character'
    ? { ...v, sheet: { ...v.sheet, conditions: next } }
    : { ...v, block: { ...v.block, conditions: next } };
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
