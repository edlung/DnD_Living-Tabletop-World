import { catalogEntry, type EquipSlot, type ItemEntry } from '@ltw/contracts';

import type { WorldState } from '../kernel/state.ts';

/**
 * Item possession (docs/adr/0039-item-possession.md): who carries an item
 * entity, whether it is worn, and how many units a stack holds. Canonical
 * state; a held item's old placement is ignored, a dropped item is placed.
 */
export interface Possession {
  /** The catalog entry the item is an instance of; null for a unique story object. */
  readonly catalogId: string | null;
  /** The carrying character or NPC; null when the item lies where it is placed. */
  readonly holderId: string | null;
  readonly quantity: number;
  readonly slot: EquipSlot | null;
  /** Armor class this worn item added to its wearer's sheet (reversed on removal). */
  readonly acDelta: number;
}

export const possessionOf = (state: WorldState, itemId: string): Possession | undefined =>
  state.possessions.get(itemId);

export const entryOf = (possession: Possession): ItemEntry | undefined =>
  possession.catalogId === null ? undefined : catalogEntry(possession.catalogId);

/** Item IDs a holder carries (worn or not), in ID order. */
export function carriedBy(state: WorldState, holderId: string): string[] {
  const ids: string[] = [];
  for (const [itemId, possession] of state.possessions) {
    if (possession.holderId === holderId && possession.quantity > 0) ids.push(itemId);
  }
  return ids.sort();
}

/** The item a holder wears in a slot, if any. */
export function wornIn(state: WorldState, holderId: string, slot: EquipSlot): string | null {
  for (const [itemId, possession] of state.possessions) {
    if (possession.holderId === holderId && possession.slot === slot) return itemId;
  }
  return null;
}

const abilityModifier = (score: number): number => Math.floor((score - 10) / 2);

/**
 * The armor class a worn item adds to a sheet whose Dexterity score is given:
 * body armor replaces the unarmored base of 10 + Dexterity, a shield adds its bonus.
 */
export function armorClassDelta(entry: ItemEntry, slot: EquipSlot, dexterity: number): number {
  if (slot === 'body' && entry.armor) {
    const dex = abilityModifier(dexterity);
    const capped = entry.armor.dexCap === null ? dex : Math.min(dex, entry.armor.dexCap);
    return entry.armor.baseAc + capped - (10 + dex);
  }
  if (slot === 'offhand' && entry.shieldBonus !== undefined) return entry.shieldBonus;
  return 0;
}

export const clampArmorClass = (value: number): number => Math.min(40, Math.max(1, value));
