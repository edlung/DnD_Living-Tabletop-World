import type { InventoryResponse } from '@ltw/contracts';
import { itemEntry } from '@ltw/domain';
import { srdEquipment, srdMagicItem } from '@ltw/rules';

/**
 * The SRD's words and table row for an SRD item catalog entry (`srd-…`; docs/adr/0054-items-as-
 * data.md §2, §4); null for Ravenford's own. The domain reads the entries; their words live in
 * `@ltw/rules`, which the server adds.
 */
export const srdWordsOf = (itemId: string) =>
  itemId.startsWith('srd-') ? (srdEquipment(itemId.slice(4)) ?? null) : null;

/** A magic entry's item of Magic Items A–Z; null for a mundane one. */
export const srdMagicOf = (itemId: string) => {
  const text = itemEntry(itemId)?.magic?.text;
  return text === undefined ? null : (srdMagicItem(text) ?? null);
};

/** What the SRD says of an entry: its equipment's words, else its magic item's. */
export const srdTextOf = (itemId: string): string | null =>
  srdWordsOf(itemId)?.text || srdMagicOf(itemId)?.text || null;

/** An inventory with each SRD entry's words beside it (the domain cannot read them). */
export const withSrdWords = (body: InventoryResponse): InventoryResponse => ({
  ...body,
  items: body.items.map((item) => {
    const words = item.catalog ? srdTextOf(item.catalog.itemId) : null;
    return item.catalog && words ? { ...item, catalog: { ...item.catalog, text: words } } : item;
  }),
});
