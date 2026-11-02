import { z } from 'zod';

import { entityIdSchema } from '../kernel/identifiers.ts';
import type { SrdEquipment } from '../srd/equipment.ts';
import { itemCatalogIdSchema, type ItemCategory } from './schema.ts';

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
}

export const giveCatalogItemRequestSchema = z
  .object({
    requestId: z.uuid(),
    holderId: entityIdSchema,
    quantity: z.number().int().min(1).max(99).default(1),
  })
  .strict();
export type GiveCatalogItemRequest = z.input<typeof giveCatalogItemRequestSchema>;

export interface GivenCatalogItemResponse {
  readonly status: 'given';
  /** The new item's entity. */
  readonly itemId: string;
}

export const catalogItemIdSchema = itemCatalogIdSchema;
