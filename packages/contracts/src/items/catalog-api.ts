import { z } from 'zod';

import { entityIdSchema } from '../kernel/identifiers.ts';
import type { SrdEquipment } from '../srd/equipment.ts';
import type { SrdMagicItem } from '../srd/magic-items.ts';
import {
  itemCatalogIdSchema,
  type ItemCategory,
  type ItemMagic,
  type ItemRarity,
} from './schema.ts';

/**
 * The DM's item catalog (docs/adr/0054-items-as-data.md §4): a campaign's entries — Ravenford's
 * own and the SRD's — to find by name, category or source, one's whole words, and one given to a
 * character or a creature: a new item carried by it, in a quantity when it stacks.
 */
export interface ItemCatalogListing {
  readonly itemId: string;
  readonly name: { readonly ru: string; readonly en: string };
  readonly category: ItemCategory;
  readonly valueCp: number;
  readonly weightLb: number;
  readonly stackable: boolean;
  readonly source: 'srd' | null;
  readonly untranslated: boolean;
  /** A magic item's rarity; null for a mundane one (docs/adr/0054-items-as-data.md §5). */
  readonly rarity: ItemRarity | null;
  /** Null: none needed; "": anyone; else who may. */
  readonly attunement: string | null;
  /** What a magic weapon, armor, shield or ammunition may be made on. */
  readonly base: NonNullable<ItemMagic['base']> | null;
}

export interface ItemCatalogResponse {
  readonly items: readonly ItemCatalogListing[];
}

export interface ItemCatalogEntryResponse {
  readonly item: ItemCatalogListing & {
    readonly description: { readonly ru: string; readonly en: string };
  };
  /** The SRD's words and table row for an SRD entry; null for Ravenford's own. */
  readonly srd: SrdEquipment | null;
  /** The SRD's magic item it follows; null for a mundane one. */
  readonly magic: SrdMagicItem | null;
}

export const giveCatalogItemRequestSchema = z
  .object({
    requestId: z.uuid(),
    holderId: entityIdSchema,
    quantity: z.number().int().min(1).max(99).default(1),
    /** What a magic weapon, armor, shield or ammunition is made on (§5). */
    baseCatalogId: itemCatalogIdSchema.optional(),
    /** Given unidentified: its carrier sees what it looks like until it is identified (§5). */
    unidentified: z.literal(true).optional(),
  })
  .strict();
export type GiveCatalogItemRequest = z.input<typeof giveCatalogItemRequestSchema>;

export interface GivenCatalogItemResponse {
  readonly status: 'given';
  /** The new item's entity. */
  readonly itemId: string;
  /** Its name in the campaign: "Longsword, +1" for a +1 weapon made on a longsword. */
  readonly name: string;
}

export const catalogItemIdSchema = itemCatalogIdSchema;

/**
 * Attunement asked at the table (docs/adr/0054-items-as-data.md §5): a player for their own
 * character during a Short Rest, the DM any time; lifting a curse is the DM's.
 */
export const attuneRequestSchema = z
  .object({
    requestId: z.uuid(),
    characterId: entityIdSchema,
    attuned: z.boolean(),
    liftCurse: z.literal(true).optional(),
  })
  .strict();
export type AttuneRequest = z.infer<typeof attuneRequestSchema>;

export interface AttunedResponse {
  readonly status: 'attuned' | 'unattuned';
}

/**
 * An item identified at the table (§5): a player in a Short Rest, or tasting a potion any time;
 * the DM any time.
 */
export const identifyRequestSchema = z
  .object({ requestId: z.uuid(), characterId: entityIdSchema })
  .strict();

export interface IdentifiedResponse {
  readonly status: 'identified';
  /** What it is, in the campaign's language. */
  readonly name: string;
}
