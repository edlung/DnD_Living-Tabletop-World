import { itemEntrySchema, type ItemEntry } from '../schema.ts';
import equipment from './equipment.json' with { type: 'json' };
import magicItems from './magic-items.json' with { type: 'json' };

/**
 * The SRD's entries of a campaign's item catalog (docs/adr/0054-items-as-data.md §2–3, §5) — its
 * equipment and its magic items — written by
 * the SRD import (`scripts/srd/`, never by hand) and validated at load. Reached through
 * `@ltw/contracts/srd-items`: the World Engine reads it; the browser's bundle never carries it.
 */
const ENTRIES: readonly ItemEntry[] = [...equipment, ...magicItems].map((entry) =>
  itemEntrySchema.parse(entry),
);

const BY_ID: ReadonlyMap<string, ItemEntry> = new Map(
  ENTRIES.map((entry) => [entry.itemId, entry]),
);
if (BY_ID.size !== ENTRIES.length) throw new Error('duplicate SRD item catalog ID');

export const SRD_ITEM_CATALOG: readonly ItemEntry[] = ENTRIES;
export const srdItemEntry = (itemId: string): ItemEntry | undefined => BY_ID.get(itemId);
