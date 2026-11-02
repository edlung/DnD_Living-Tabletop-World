import type { InventoryResponse } from '@ltw/contracts';
import { srdEquipment } from '@ltw/rules';

/**
 * The SRD's words and table row for an SRD item catalog entry (`srd-…`; docs/adr/0054-items-as-
 * data.md §2, §4); null for Ravenford's own. The domain reads the entries; their words live in
 * `@ltw/rules`, which the server adds.
 */
export const srdWordsOf = (itemId: string) =>
  itemId.startsWith('srd-') ? (srdEquipment(itemId.slice(4)) ?? null) : null;

/** An inventory with each SRD entry's words beside it (the domain cannot read them). */
export const withSrdWords = (body: InventoryResponse): InventoryResponse => ({
  ...body,
  items: body.items.map((item) => {
    const words = item.catalog ? srdWordsOf(item.catalog.itemId)?.text : undefined;
    return item.catalog && words ? { ...item, catalog: { ...item.catalog, text: words } } : item;
  }),
});
