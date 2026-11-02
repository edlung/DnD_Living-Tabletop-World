import type { ItemEntry } from '../schema.ts';

/** The SRD's magic items as catalog entries (docs/adr/0054-items-as-data.md §5). */
declare const entries: readonly ItemEntry[];
export = entries;
