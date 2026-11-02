import { catalogEntry, type ItemEntry } from '@ltw/contracts';
import { srdItemEntry } from '@ltw/contracts/srd-items';

/**
 * A campaign's item catalog (docs/adr/0054-items-as-data.md §3): Ravenford's own entries and the
 * SRD's (`srd-…`), one space of ids. Every item rule reads its entry here.
 */
export const itemEntry = (catalogId: string): ItemEntry | undefined =>
  catalogEntry(catalogId) ?? srdItemEntry(catalogId);

/**
 * A magic weapon, armor, shield or ammunition made on its base (docs/adr/0054-items-as-data.md §5):
 * the base's kind, slots, stack, weight, armor and weapon; the magic entry's name, words and magic;
 * the worth of both.
 */
export const madeOn = (magic: ItemEntry, base: ItemEntry): ItemEntry => {
  const { armor, shieldBonus, weapon, ammunition } = base;
  return {
    itemId: magic.itemId,
    category: base.category,
    name: magic.name,
    description: magic.description,
    weightLb: base.weightLb,
    valueCp: base.valueCp + magic.valueCp,
    stackable: base.stackable,
    slots: base.slots,
    ...(armor ? { armor } : {}),
    ...(shieldBonus === undefined ? {} : { shieldBonus }),
    ...(weapon ? { weapon } : {}),
    ...(ammunition ? { ammunition } : {}),
    ...(magic.source ? { source: magic.source } : {}),
    ...(magic.untranslated ? { untranslated: magic.untranslated } : {}),
    ...(magic.magic ? { magic: magic.magic } : {}),
  };
};

/**
 * The base a magic item is given on: the one named, or the only one its entry allows; the words of
 * a refusal otherwise. Null for an entry made on nothing.
 */
export function baseOfGrant(
  entry: ItemEntry | undefined,
  baseCatalogId: string | null,
): ItemEntry | null | string {
  const allowed = entry?.magic?.base?.allowed;
  if (!entry || !allowed)
    return baseCatalogId === null ? null : 'Only a magic weapon, armor or shield is made on a base';
  const id = baseCatalogId ?? (allowed.length === 1 ? (allowed[0] ?? null) : null);
  if (id === null) return `Name what "${entry.itemId}" is made on`;
  if (!allowed.includes(id)) return `"${entry.itemId}" cannot be made on "${id}"`;
  return itemEntry(id) ?? `Unknown catalog item "${id}"`;
}
