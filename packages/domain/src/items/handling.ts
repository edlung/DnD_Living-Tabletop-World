import type { CharacterSheet } from '@ltw/contracts';

import { premisesEvent } from '../investigation/acting.ts';
import type { Premise } from '../investigation/events.ts';
import { findEntity, type Lookup } from '../kernel/decide/lookups.ts';
import { accept, reject, type Decision } from '../kernel/decision.ts';
import type { KernelEvent } from '../kernel/events.ts';
import type { EntityState, WorldState } from '../kernel/state.ts';
import { spendTurn, type ItemCost } from './economy.ts';
import { possessionOf, type Possession } from './records.ts';

/**
 * What every item decision checks and records (docs/adr/0039-item-possession.md): who may carry,
 * what an item is, the acting character's own item, the premises a player's command relied on,
 * and a sheet change beside the item's event.
 */
const CARRIER_KINDS = new Set(['character', 'npc']);

export function carrier(state: WorldState, id: string): Lookup<EntityState> {
  const found = findEntity(state, id);
  if (!found.ok) return found;
  if (!CARRIER_KINDS.has(found.value.kind))
    return reject('INVALID_ITEM', `Entity "${id}" cannot carry items`, { entityId: id });
  if (found.value.status !== 'active')
    return reject('ACTOR_DEAD', `"${id}" cannot handle items`, { entityId: id });
  return found;
}

export function item(state: WorldState, id: string): Lookup<EntityState> {
  const found = findEntity(state, id);
  if (!found.ok) return found;
  if (found.value.kind !== 'item')
    return reject('INVALID_ITEM', `Entity "${id}" is not an item`, { itemId: id });
  if (found.value.status !== 'active')
    return reject('ENTITY_DESTROYED', `Item "${id}" is destroyed`, { itemId: id });
  return found;
}

/** Refusals shared by every play action of a character: dead, unconscious. */
export function mayHandle(state: WorldState, characterId: string): Lookup<EntityState> {
  const actor = carrier(state, characterId);
  if (!actor.ok) return actor;
  if (state.characterSheets.get(characterId)?.conditions.includes('unconscious'))
    return reject('ACTOR_INCAPACITATED', `"${characterId}" is unconscious`);
  return actor;
}

/**
 * The acting character's own, active item. What they do not carry is refused alike whether it
 * exists, is hidden, or is not an item: a refusal never confirms an entity (ADR 0013 §1).
 */
export function ownItem(
  state: WorldState,
  characterId: string,
  itemId: string,
): { ok: true; possession: Possession; actor: EntityState } | (Decision & { ok: false }) {
  const actor = mayHandle(state, characterId);
  if (!actor.ok) return actor;
  const possession = possessionOf(state, itemId);
  if (possession?.holderId !== characterId)
    return reject('INVALID_ITEM', `"${characterId}" does not carry "${itemId}"`, { itemId });
  const thing = item(state, itemId);
  if (!thing.ok) return thing;
  return { ok: true, possession, actor: actor.value };
}

/** A player's item command: the premises it relied on come first (Gate 02, G02-H02). */
export const played = (
  state: WorldState,
  characterId: string,
  premises: readonly Premise[],
  events: readonly KernelEvent[],
  cost: ItemCost,
): Decision => {
  const spent = spendTurn(state, characterId, cost);
  return spent.ok
    ? accept(premisesEvent(characterId, premises), ...events, ...spent.events)
    : spent;
};

export const SELF: readonly Premise[] = [{ kind: 'self' }, { kind: 'sheet' }];

/** The item event(s), plus a sheet change when the sheet exists and the change alters it. */
export function withSheet(
  state: WorldState,
  characterId: string,
  events: KernelEvent[],
  change: (sheet: CharacterSheet) => CharacterSheet,
): KernelEvent[] {
  const sheet = state.characterSheets.get(characterId);
  if (!sheet) return events;
  const next = change(sheet);
  return next === sheet
    ? events
    : [...events, { type: 'CharacterSheetSet', payload: { entityId: characterId, sheet: next } }];
}

/** A sheet with `change` added to what worn magic adds to its saves (ADR 0054 §5); none at zero. */
export function withSaveBonus(sheet: CharacterSheet, change: number): CharacterSheet {
  if (change === 0) return sheet;
  const value = (sheet.saveBonus ?? 0) + change;
  const next: CharacterSheet = { ...sheet, saveBonus: value };
  if (value === 0) delete next.saveBonus;
  return next;
}
