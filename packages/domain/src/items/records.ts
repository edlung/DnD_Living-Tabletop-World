import type { AmmunitionKind, EquipSlot, ItemEntry, WeaponId } from '@ltw/contracts';

import type { WorldState } from '../kernel/state.ts';
import { itemEntry, madeOn } from './catalog.ts';

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
  /** What a magic weapon, armor or shield is made on (docs/adr/0054-items-as-data.md §5). */
  readonly baseCatalogId?: string;
  /** Its carrier is attuned to it (§5). */
  readonly attuned?: true;
  /** What this worn item added to its wearer's saving throws (reversed on removal). */
  readonly saveDelta?: number;
  /** A magic item's charges left (§5). */
  readonly charges?: number;
  /** Its carrier has not learnt what it is (§5). */
  readonly unidentified?: true;
}

export const possessionOf = (state: WorldState, itemId: string): Possession | undefined =>
  state.possessions.get(itemId);

/** The entry an item follows; a magic one made on a base, with the base's numbers. */
export function entryOf(possession: Possession): ItemEntry | undefined {
  const entry = possession.catalogId === null ? undefined : itemEntry(possession.catalogId);
  const base =
    possession.baseCatalogId === undefined ? undefined : itemEntry(possession.baseCatalogId);
  return entry && base ? madeOn(entry, base) : entry;
}

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
export function armorClassDelta(
  entry: ItemEntry,
  slot: EquipSlot,
  dexterity: number,
  attuned = false,
): number {
  if (slot === 'body' && entry.armor) {
    const dex = abilityModifier(dexterity);
    const capped = entry.armor.dexCap === null ? dex : Math.min(dex, entry.armor.dexCap);
    return entry.armor.baseAc + capped - (10 + dex) + magicBonus(entry, attuned).armorClass;
  }
  if (slot === 'offhand' && entry.shieldBonus !== undefined)
    return entry.shieldBonus + magicBonus(entry, attuned).armorClass;
  // A worn ring's or cloak's: a Ring of Protection's +1.
  return entry.armor || entry.shieldBonus !== undefined ? 0 : magicBonus(entry, attuned).armorClass;
}

/**
 * What a magic item worn gives its wearer's Armor Class and saves (docs/adr/0054-items-as-data.md
 * §5) — a +1 Plate Armor's, a Ring of Protection's — when it needs no attunement or is attuned.
 */
export function magicBonus(
  entry: ItemEntry,
  attuned: boolean,
): { readonly armorClass: number; readonly saves: number } {
  const magic = entry.magic;
  if (!magic || (magic.attunement !== null && !attuned)) return { armorClass: 0, saves: 0 };
  return { armorClass: magic.bonus?.armorClass ?? 0, saves: magic.bonus?.saves ?? 0 };
}

/**
 * A magic weapon's bonus to attack and damage (docs/adr/0054-items-as-data.md §5): the best a
 * holder's hands hold of that weapon, when it needs no attunement.
 */
export function wieldedBonus(
  state: WorldState,
  holderId: string,
  weaponId: WeaponId,
): { readonly attack: number; readonly damage: number } {
  let best = { attack: 0, damage: 0 };
  for (const itemId of carriedBy(state, holderId)) {
    const possession = state.possessions.get(itemId);
    const entry = possession ? entryOf(possession) : undefined;
    const usable = entry?.magic?.attunement === null || possession?.attuned === true;
    const bonus = usable ? entry?.magic?.bonus : undefined;
    const held = possession?.slot === 'mainhand' || possession?.slot === 'offhand';
    if (!held || entry?.weapon !== weaponId || !bonus) continue;
    if ((bonus.attack ?? 0) > best.attack)
      best = { attack: bonus.attack ?? 0, damage: bonus.damage ?? 0 };
  }
  return best;
}

export const clampArmorClass = (value: number): number => Math.min(40, Math.max(1, value));

/**
 * The rules weapons a holder wields (Stage 520): weapon items it carries in a hand, in slot order
 * (main hand first). A character attacks with these beside the weapons its sheet lists.
 */
export function wieldedWeapons(state: WorldState, holderId: string): WeaponId[] {
  const wielded: WeaponId[] = [];
  for (const slot of ['mainhand', 'offhand'] as const) {
    for (const itemId of carriedBy(state, holderId)) {
      const possession = state.possessions.get(itemId);
      const weapon = possession?.slot === slot ? entryOf(possession)?.weapon : undefined;
      if (weapon && !wielded.includes(weapon) && state.entities.get(itemId)?.status === 'active') {
        wielded.push(weapon);
      }
    }
  }
  return wielded;
}

/** What a holder's hands hold (docs/adr/0047-weapons.md §7): each hand's weapon, and a shield. */
export interface Hands {
  readonly main: WeaponId | null;
  readonly off: WeaponId | null;
  readonly shield: boolean;
}

export function handsOf(state: WorldState, holderId: string): Hands {
  const held = (slot: EquipSlot) => {
    const itemId = wornIn(state, holderId, slot);
    const possession = itemId === null ? undefined : state.possessions.get(itemId);
    return possession && state.entities.get(itemId ?? '')?.status === 'active'
      ? entryOf(possession)
      : undefined;
  };
  const main = held('mainhand');
  const off = held('offhand');
  return {
    main: main?.weapon ?? null,
    off: off?.weapon ?? null,
    shield: off?.shieldBonus !== undefined,
  };
}

/**
 * The stacks of one kind of ammunition a holder carries, empty ones included, in ID order
 * (docs/adr/0047-weapons.md §5): none at all means its ammunition of that kind is not counted.
 */
export function ammunitionOf(
  state: WorldState,
  holderId: string,
  kind: AmmunitionKind,
): { readonly itemId: string; readonly quantity: number }[] {
  const stacks: { itemId: string; quantity: number }[] = [];
  for (const [itemId, possession] of state.possessions) {
    if (possession.holderId !== holderId || entryOf(possession)?.ammunition !== kind) continue;
    if (state.entities.get(itemId)?.status !== 'active') continue;
    stacks.push({ itemId, quantity: possession.quantity });
  }
  return stacks.sort((a, b) => a.itemId.localeCompare(b.itemId));
}
