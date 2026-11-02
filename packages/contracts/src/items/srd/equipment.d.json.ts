import type { ItemEntry } from '../schema.ts';

/** The SRD's equipment as catalog entries (docs/adr/0054-items-as-data.md §2). */
declare const entries: readonly ItemEntry[];
export = entries;
