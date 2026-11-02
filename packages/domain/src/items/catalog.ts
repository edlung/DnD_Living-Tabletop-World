import { catalogEntry, type ItemEntry } from '@ltw/contracts';
import { srdItemEntry } from '@ltw/contracts/srd-items';

/**
 * A campaign's item catalog (docs/adr/0054-items-as-data.md §3): Ravenford's own entries and the
 * SRD's (`srd-…`), one space of ids. Every item rule reads its entry here.
 */
export const itemEntry = (catalogId: string): ItemEntry | undefined =>
  catalogEntry(catalogId) ?? srdItemEntry(catalogId);
