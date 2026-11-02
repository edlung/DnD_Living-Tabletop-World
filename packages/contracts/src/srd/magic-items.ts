import { z } from 'zod';

import { srdIdSchema } from './catalog.ts';

/**
 * The SRD's Magic Items A–Z as it gives them (docs/adr/0054-items-as-data.md §1): name, category
 * and what it is made of, rarity, attunement and who may attune, and the text in its paragraphs,
 * one per line. English, read only; the catalog's entries the World Engine applies are
 * `@ltw/contracts/srd-items`.
 */
export const SRD_MAGIC_CATEGORIES = [
  'Armor',
  'Potion',
  'Ring',
  'Rod',
  'Scroll',
  'Staff',
  'Wand',
  'Weapon',
  'Wondrous Item',
] as const;

export const srdMagicItemSchema = z
  .object({
    itemId: srdIdSchema,
    name: z.string().min(1).max(80),
    category: z.enum(SRD_MAGIC_CATEGORIES),
    /** What its category line names in parentheses: "Any Medium or Heavy, Except Hide Armor". */
    of: z.string().min(1).max(120).nullable(),
    /** As written: "Rare", "Uncommon (+1), Rare (+2), or Very Rare (+3)", "Rarity Varies". */
    rarity: z.string().min(1).max(120),
    /** Null: none needed; "": anyone; else who may ("by a Wizard"). */
    attunement: z.string().max(120).nullable(),
    text: z.string().min(1).max(12_000),
  })
  .strict();
export type SrdMagicItem = z.infer<typeof srdMagicItemSchema>;
