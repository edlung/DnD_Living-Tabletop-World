import { ARMOR_ITEMS } from './catalog-armor.ts';
import { CONSUMABLE_ITEMS } from './catalog-consumables.ts';
import { GEAR_ITEMS } from './catalog-gear.ts';
import { itemEntrySchema, type ItemEntry } from './schema.ts';

/**
 * The item catalog (docs/adr/0039-item-possession.md): every entry validated
 * at load, so a malformed entry fails the first import rather than play.
 * Weapons keep their own definitions in `@ltw/rules` (`WEAPONS`); they are
 * referenced from sheets by weapon ID and are not catalog items here.
 */
const ENTRIES: readonly ItemEntry[] = [...ARMOR_ITEMS, ...CONSUMABLE_ITEMS, ...GEAR_ITEMS].map(
  (entry) => itemEntrySchema.parse(entry),
);

const BY_ID: ReadonlyMap<string, ItemEntry> = new Map(
  ENTRIES.map((entry) => [entry.itemId, entry]),
);
if (BY_ID.size !== ENTRIES.length) throw new Error('duplicate item catalog ID');

export const ITEM_CATALOG: readonly ItemEntry[] = ENTRIES;
export const catalogEntry = (itemId: string): ItemEntry | undefined => BY_ID.get(itemId);
export const isCatalogItemId = (itemId: string): boolean => BY_ID.has(itemId);
