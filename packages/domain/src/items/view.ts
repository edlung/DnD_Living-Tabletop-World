import type { InventoryItem, InventoryResponse } from '@ltw/contracts';

import type { WorldState } from '../kernel/state.ts';
import type { ResolvedPerspective } from '../knowledge/perspective.ts';
import { entityRef } from '../knowledge/projection.ts';
import { carriedBy, entryOf, possessionOf } from './records.ts';

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
  if (holder?.kind !== 'character' && holder?.kind !== 'npc') return null;
  const items: InventoryItem[] = [];
  let totalWeightLb = 0;
  for (const itemId of carriedBy(state, entityId)) {
    const possession = possessionOf(state, itemId);
    const entity = state.entities.get(itemId);
    if (!possession || entity?.status !== 'active') continue;
    // A magic one made on a base, with the base's numbers (docs/adr/0054-items-as-data.md §5).
    const entry = entryOf(possession);
    totalWeightLb += (entry?.weightLb ?? 0) * possession.quantity;
    items.push({
      itemId,
      name: entity.name,
      description: entity.description,
      quantity: possession.quantity,
      slot: possession.slot,
      attuned: possession.attuned === true,
      catalog: entry
        ? {
            itemId: entry.itemId,
            category: entry.category,
            name: { ru: entry.name.ru, en: entry.name.en },
            description: { ru: entry.description.ru, en: entry.description.en },
            weightLb: entry.weightLb,
            slots: [...entry.slots],
            effect: entry.effect ? { ...entry.effect } : null,
            valueCp: entry.valueCp,
            armor: entry.armor ? { baseAc: entry.armor.baseAc, dexCap: entry.armor.dexCap } : null,
            shieldBonus: entry.shieldBonus ?? null,
            weapon: entry.weapon ?? null,
            source: entry.source ?? null,
            untranslated: entry.untranslated === true,
            // The SRD's words come from the server (`@ltw/rules`), which the domain cannot read.
            text: null,
            magic: entry.magic
              ? {
                  rarity: entry.magic.rarity,
                  attunement: entry.magic.attunement,
                  bonus: entry.magic.bonus ? { ...entry.magic.bonus } : null,
                  cursed: dm && entry.magic.cursed === true,
                }
              : null,
          }
        : null,
    });
  }
  return {
    perspective: perspective.label,
    entity: entityRef(state, entityId),
    items,
    totalWeightLb: Math.round(totalWeightLb * 10) / 10,
  };
}
