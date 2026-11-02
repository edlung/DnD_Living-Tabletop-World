import type { EntityRef } from '../knowledge/views.ts';
import type { WeaponId } from '../rules/character-sheet.ts';
import type { EquipSlot, ItemCategory, ItemEffect, ItemMagic, ItemRarity } from './schema.ts';

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
    /** Worth in copper pennies (Stage 520). */
    readonly valueCp: number;
    readonly armor: { readonly baseAc: number; readonly dexCap: number | null } | null;
    readonly shieldBonus: number | null;
    /** The rules weapon a weapon fights as. */
    readonly weapon: WeaponId | null;
    /** The SRD's entry, or Ravenford's own (null) (docs/adr/0054-items-as-data.md §3). */
    readonly source: 'srd' | null;
    /** Its Russian words are still the English ones (Stage 650e translates them). */
    readonly untranslated: boolean;
    /** The SRD's words about it, English, for an SRD entry; null for Ravenford's own. */
    readonly text: string | null;
    /** A magic item's rarity, attunement and bonuses (docs/adr/0054-items-as-data.md §5). */
    readonly magic: {
      readonly rarity: ItemRarity;
      readonly attunement: string | null;
      readonly bonus: ItemMagic['bonus'] | null;
    } | null;
  } | null;
}

/** A weapon's attack for the carrying character, by the rules (the server adds it, Stage 520). */
export interface InventoryWeapon {
  readonly attackBonus: number;
  readonly damage: { readonly count: number; readonly sides: number; readonly bonus: number };
  readonly damageType: string;
  readonly ranged: boolean;
  /** Reach for a melee weapon; normal and long range for a ranged one. */
  readonly normalRangeFt: number;
  readonly longRangeFt: number;
  readonly properties: readonly string[];
}

/** The items a character carries; shown to the DM or to that character's own perspective only. */
export interface InventoryResponse {
  readonly perspective: string;
  readonly entity: EntityRef;
  readonly items: readonly InventoryItem[];
  readonly totalWeightLb: number;
  /** What Strength carries (× 15 lb), when the carrier has a sheet (Stage 520). */
  readonly capacityLb?: number;
  /** Each carried weapon's attack for this character, by rules weapon ID. */
  readonly weapons?: Readonly<Partial<Record<WeaponId, InventoryWeapon>>>;
}
