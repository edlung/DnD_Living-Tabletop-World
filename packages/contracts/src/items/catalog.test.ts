import { describe, expect, it } from 'vitest';

import { ITEM_CATALOG, catalogEntry } from './catalog.ts';
import { itemEntrySchema } from './schema.ts';

describe('item catalog', () => {
  it('holds only valid, unique entries with both languages', () => {
    const ids = ITEM_CATALOG.map((entry) => entry.itemId);
    expect(new Set(ids).size).toBe(ids.length);
    for (const entry of ITEM_CATALOG) {
      expect(itemEntrySchema.safeParse(entry).success, entry.itemId).toBe(true);
      expect(entry.name.ru).not.toBe(entry.name.en);
      expect(/[а-яё]/i.test(entry.name.ru), entry.itemId).toBe(true);
    }
  });

  it('covers every category the design lists', () => {
    const categories = new Set(ITEM_CATALOG.map((entry) => entry.category));
    for (const category of ['armor', 'shield', 'consumable', 'gear', 'tool'])
      expect(categories.has(category as never), category).toBe(true);
    expect(ITEM_CATALOG.length).toBeGreaterThanOrEqual(25);
  });

  it('never reuses an SRD item name as its ID', () => {
    for (const reserved of ['chain-mail', 'plate-armor', 'potion-of-healing', 'longsword'])
      expect(catalogEntry(reserved)).toBeUndefined();
  });

  it('rejects an inconsistent entry', () => {
    const [first] = ITEM_CATALOG;
    expect(itemEntrySchema.safeParse({ ...first, category: 'consumable' }).success).toBe(false);
    expect(itemEntrySchema.safeParse({ ...first, itemId: 'Bad ID' }).success).toBe(false);
  });
});
