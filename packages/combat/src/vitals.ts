import type { Ability, CharacterSheet, Condition, StatBlock } from '@ltw/contracts';
import type { DraftEvent, WorldState } from '@ltw/domain';
import { abilityModifier, effectiveSpeedFt, savingThrowModifier } from '@ltw/rules';

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
export const incapacitated = (v: Vitals) => has(v, 'incapacitated') || has(v, 'unconscious');
export const dexterity = (v: Vitals) =>
  v.kind === 'character' ? v.sheet.abilities.dex : v.block.abilities.dex;
export const initiativeModifier = (v: Vitals) =>
  v.kind === 'character' ? abilityModifier(v.sheet.abilities.dex) : v.block.initiativeBonus;
export const saveModifier = (v: Vitals, ability: Ability) =>
  v.kind === 'character' ? savingThrowModifier(v.sheet, ability) : v.block.savingThrows[ability];

/** Speed after conditions: Unconscious is 0, Slowed is 10 ft less (ADR 0011, ADR 0015). */
export function speedOf(v: Vitals): number {
  if (has(v, 'unconscious')) return 0;
  return v.kind === 'character'
    ? effectiveSpeedFt(v.sheet)
    : Math.max(0, v.block.speedFt - (has(v, 'slowed') ? 10 : 0));
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
