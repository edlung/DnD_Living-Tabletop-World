import { describe, expect, it } from 'vitest';

import { ITEM_CATALOG, catalogEntry } from '../catalog.ts';
import { itemEntrySchema } from '../schema.ts';
import { SRD_ITEM_CATALOG, srdItemEntry } from './catalog.ts';

/**
 * The SRD's entries beside Ravenford's own (docs/adr/0054-items-as-data.md §2–3): one space of
 * ids, the SRD's marked and prefixed, and Ravenford's keeping names of their own (ADR 0039).
 */
describe('the SRD’s item catalog', () => {
  it('holds valid entries, all the SRD’s, under ids of their own', () => {
    for (const entry of SRD_ITEM_CATALOG) {
      expect(itemEntrySchema.safeParse(entry).success, entry.itemId).toBe(true);
      expect(entry.itemId, entry.itemId).toMatch(/^srd-/);
      expect(entry.source).toBe('srd');
      expect(catalogEntry(entry.itemId), entry.itemId).toBeUndefined();
    }
    expect(srdItemEntry('srd-longsword')?.weapon).toBe('longsword');
    expect(srdItemEntry('longsword')).toBeUndefined();
  });

  it('leaves Ravenford’s own names to Ravenford', () => {
    const srdNames = new Set(SRD_ITEM_CATALOG.map((entry) => entry.name.en.toLowerCase()));
    for (const entry of ITEM_CATALOG) {
      expect(entry.source, entry.itemId).toBeUndefined();
      expect(srdNames.has(entry.name.en.toLowerCase()), entry.name.en).toBe(false);
    }
  });

  it('marks the English words it still shows in Russian', () => {
    for (const entry of SRD_ITEM_CATALOG)
      if (entry.name.ru === entry.name.en) expect(entry.untranslated, entry.itemId).toBe(true);
  });
});
