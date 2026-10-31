import type { EntityRef } from '../knowledge/views.ts';
import type { EquipSlot, ItemCategory, ItemEffect } from './schema.ts';

/** One carried item as its carrier sees it (docs/adr/0039-item-possession.md). */
export interface InventoryItem {
  readonly itemId: string;
  /** The world's name for this object. */
  readonly name: string;
  readonly description: string;
  readonly quantity: number;
  /** The slot it is worn in, or null. */
  readonly slot: EquipSlot | null;
  /** What it is, when it is an instance of a catalog entry; never a claim about the object. */
  readonly catalog: {
    readonly itemId: string;
    readonly category: ItemCategory;
    readonly name: { readonly ru: string; readonly en: string };
    readonly description: { readonly ru: string; readonly en: string };
    readonly weightLb: number;
    readonly slots: readonly EquipSlot[];
    readonly effect: ItemEffect | null;
  } | null;
}

/** The items a character carries; shown to the DM or to that character's own perspective only. */
export interface InventoryResponse {
  readonly perspective: string;
  readonly entity: EntityRef;
  readonly items: readonly InventoryItem[];
  readonly totalWeightLb: number;
}
