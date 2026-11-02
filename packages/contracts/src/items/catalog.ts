import { ARMOR_ITEMS } from './catalog-armor.ts';
import { CONSUMABLE_ITEMS } from './catalog-consumables.ts';
import { GEAR_ITEMS } from './catalog-gear.ts';
import { AMMUNITION_ITEMS, COIN_ITEMS, WEAPON_ITEMS } from './catalog-weapons.ts';
import { itemEntrySchema, type ItemEntry } from './schema.ts';

/**
 * The item catalog (docs/adr/0039-item-possession.md): every entry validated
 * at load, so a malformed entry fails the first import rather than play.
 * A weapon item names the rules weapon it fights as (`weapon`, `@ltw/rules` WEAPONS); sheets
 * may also list rules weapons directly. Coins are stackable catalog items (Stage 520).
 */
const ENTRIES: readonly ItemEntry[] = [
  ...ARMOR_ITEMS,
  ...CONSUMABLE_ITEMS,
  ...GEAR_ITEMS,
  ...WEAPON_ITEMS,
  ...AMMUNITION_ITEMS,
  ...COIN_ITEMS,
].map((entry) => itemEntrySchema.parse(entry));

const BY_ID: ReadonlyMap<string, ItemEntry> = new Map(
  ENTRIES.map((entry) => [entry.itemId, entry]),
);
if (BY_ID.size !== ENTRIES.length) throw new Error('duplicate item catalog ID');

export const ITEM_CATALOG: readonly ItemEntry[] = ENTRIES;
export const catalogEntry = (itemId: string): ItemEntry | undefined => BY_ID.get(itemId);
export const isCatalogItemId = (itemId: string): boolean => BY_ID.has(itemId);
