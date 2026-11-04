import type { InventoryItem, InventoryResponse, ItemEntry } from '@ltw/contracts';

import type { WorldState } from '../kernel/state.ts';
import type { ResolvedPerspective } from '../knowledge/perspective.ts';
import { entityRef } from '../knowledge/projection.ts';
import { itemEntry } from './catalog.ts';
import { PARTY_STASH, carriedBy, entryOf, isPartyCharacter, possessionOf } from './records.ts';

/**
 * What a character carries, for the DM or for that character's own perspective
 * only: knowing another character never grants a look into their pack
 * (docs/adr/0039-item-possession.md §9). An explicit whitelist of fields.
 */
export function inventoryView(
  state: WorldState,
  perspective: ResolvedPerspective,
  entityId: string,
): InventoryResponse | null {
  const dm = perspective.kind === 'DM';
  if (!dm && (perspective.kind !== 'CHARACTER' || perspective.holderId !== entityId)) return null;
  const holder = state.entities.get(entityId);
  // A creature's things are the DM's to see until it falls (ADR 0057 §7).
  const creature = dm && holder?.kind === 'creature';
  if (holder?.kind !== 'character' && holder?.kind !== 'npc' && !creature) return null;
  const items = carriedBy(state, entityId).flatMap((itemId) => {
    const one = inventoryItem(state, dm, itemId);
    return one ? [one] : [];
  });
  // The party's stash, for a member of the party (docs/adr/0057-encounters-maps-loot.md §7).
  const stash = isPartyCharacter(state, entityId)
    ? carriedBy(state, PARTY_STASH).flatMap((itemId) => {
        const one = inventoryItem(state, dm, itemId);
        return one ? [one] : [];
      })
    : null;
  return {
    perspective: perspective.label,
    entity: entityRef(state, entityId),
    items,
    ...(stash ? { stash } : {}),
    totalWeightLb: carriedWeightLb(state, entityId),
  };
}

/** One item as its viewer may know it: a magic one's base, an unidentified one's look (§5). */
export function inventoryItem(
  state: WorldState,
  dm: boolean,
  itemId: string,
): InventoryItem | null {
  const possession = possessionOf(state, itemId);
  const entity = state.entities.get(itemId);
  if (!possession || entity?.status !== 'active') return null;
  // A magic one made on a base, with the base's numbers (docs/adr/0054-items-as-data.md §5).
  const entry = entryOf(possession);
  // Unidentified, its carrier sees what it looks like (§5): a base's look, or an unknown thing.
  const unknown = !dm && possession.unidentified === true;
  const base =
    possession.baseCatalogId === undefined ? undefined : itemEntry(possession.baseCatalogId);
  const seen = unknown ? (base ?? (entry ? unknownMagic(entry) : undefined)) : entry;
  return {
    itemId,
    name: entity.name,
    description: entity.description,
    quantity: possession.quantity,
    slot: possession.slot,
    attuned: possession.attuned === true,
    unidentified: possession.unidentified === true,
    // Its charges: told once it is known, or to the DM (§5).
    charges:
      !unknown && possession.charges !== undefined && entry?.magic?.charges
        ? { left: possession.charges, max: entry.magic.charges.max }
        : null,
    catalog: seen
      ? {
          itemId: seen.itemId,
          category: seen.category,
          name: { ru: seen.name.ru, en: seen.name.en },
          description: { ru: seen.description.ru, en: seen.description.en },
          weightLb: seen.weightLb,
          slots: [...seen.slots],
          effect: seen.effect ? { ...seen.effect } : null,
          valueCp: seen.valueCp,
          armor: seen.armor ? { baseAc: seen.armor.baseAc, dexCap: seen.armor.dexCap } : null,
          shieldBonus: seen.shieldBonus ?? null,
          weapon: seen.weapon ?? null,
          source: seen.source ?? null,
          look: seen.look ?? null,
          untranslated: seen.untranslated === true,
          // The SRD's words come from the server (`@ltw/rules`), which the domain cannot read.
          text: null,
          magic: seen.magic
            ? {
                rarity: seen.magic.rarity,
                attunement: seen.magic.attunement,
                bonus: seen.magic.bonus ? { ...seen.magic.bonus } : null,
                // A curse: the DM's, or its carrier's once attuned.
                cursed: seen.magic.cursed === true && (dm || possession.attuned === true),
              }
            : null,
        }
      : null,
  };
}

/** What a holder carries weighs, in pounds to a tenth: each item's entry by its quantity. */
export function carriedWeightLb(state: WorldState, holderId: string): number {
  let total = 0;
  for (const itemId of carriedBy(state, holderId)) {
    const possession = possessionOf(state, itemId);
    if (!possession || state.entities.get(itemId)?.status !== 'active') continue;
    total += (entryOf(possession)?.weightLb ?? 0) * possession.quantity;
  }
  return Math.round(total * 10) / 10;
}

/**
 * What an unidentified magic item made on nothing looks like to its carrier (§5): extraordinary,
 * no more — its kind and where it is worn, not its name, words, worth or magic.
 */
const unknownMagic = (entry: ItemEntry): ItemEntry => ({
  itemId: 'unknown-magic-item',
  // A potion still looks like a potion: its carrier may taste it.
  category: entry.category,
  name: { en: 'An unknown magic item', ru: 'Неизвестный магический предмет' },
  description: {
    en: 'It feels extraordinary; what it does is unknown until it is identified.',
    ru: 'В нём чувствуется необычное; что он делает, неизвестно, пока его не опознают.',
  },
  weightLb: entry.weightLb,
  valueCp: 0,
  stackable: entry.stackable,
  slots: entry.slots,
  // A ring still looks like a ring, a wand like a wand (docs/adr/0055-…md §6).
  ...(entry.look ? { look: entry.look } : {}),
});
