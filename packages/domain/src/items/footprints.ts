import type { KernelEvent } from '../kernel/events.ts';
import { entityChecked, facts } from '../kernel/fact-keys.ts';
import type { Footprint } from '../kernel/facts.ts';

type ItemEvent = Extract<
  KernelEvent,
  {
    type:
      | 'ItemGranted'
      | 'ItemEquipped'
      | 'ItemUnequipped'
      | 'ItemUsed'
      | 'ItemRecovered'
      | 'ItemTransferred'
      | 'ItemSplit'
      | 'ItemAttuned'
      | 'ItemChargesSpent'
      | 'ItemChargesRegained'
      | 'ItemIdentified';
  }
>;

/**
 * Item footprints (docs/adr/0039-item-possession.md). Equip and unequip read and write the
 * holder's worn set (slot occupancy is a premise); the wearer's sheet is a premise too, and
 * it changes in its own `CharacterSheetSet` event. A transfer reads where both parties stand.
 */
export function itemFootprint(event: ItemEvent): Footprint {
  const clock = facts.clock();
  switch (event.type) {
    case 'ItemGranted':
      return {
        reads: [
          clock,
          ...entityChecked(event.payload.itemId),
          ...entityChecked(event.payload.holderId),
          facts.possession(event.payload.itemId),
        ],
        writes: [facts.possession(event.payload.itemId)],
      };
    // Attunement reads and writes the holder's worn and attuned set, and its sheet changes.
    case 'ItemEquipped':
    case 'ItemUnequipped':
    case 'ItemAttuned':
      return {
        reads: [
          clock,
          facts.encounter(),
          ...entityChecked(event.payload.itemId),
          ...entityChecked(event.payload.holderId),
          facts.possession(event.payload.itemId),
          facts.equipment(event.payload.holderId),
          facts.sheet(event.payload.holderId),
        ],
        writes: [facts.possession(event.payload.itemId), facts.equipment(event.payload.holderId)],
      };
    // A charge spent or regained, a property learnt: the item's own record.
    case 'ItemChargesSpent':
    case 'ItemChargesRegained':
    case 'ItemIdentified':
      return {
        reads: [
          clock,
          ...entityChecked(event.payload.itemId),
          facts.possession(event.payload.itemId),
        ],
        writes: [facts.possession(event.payload.itemId)],
      };
    case 'ItemUsed':
    case 'ItemRecovered':
      return {
        reads: [
          clock,
          facts.encounter(),
          ...entityChecked(event.payload.itemId),
          ...entityChecked(event.payload.holderId),
          facts.possession(event.payload.itemId),
          facts.sheet(event.payload.holderId),
        ],
        writes: [facts.possession(event.payload.itemId)],
      };
    case 'ItemSplit':
      return {
        reads: [
          clock,
          facts.encounter(),
          ...entityChecked(event.payload.itemId),
          ...entityChecked(event.payload.holderId),
          facts.possession(event.payload.itemId),
        ],
        writes: [facts.possession(event.payload.itemId), facts.possession(event.payload.newItemId)],
      };
    case 'ItemTransferred': {
      const { itemId, from, to } = event.payload;
      return {
        reads: [
          clock,
          facts.encounter(),
          ...entityChecked(itemId),
          facts.possession(itemId),
          facts.entityPlacement(itemId),
          ...(from === null ? [] : [...entityChecked(from), facts.entityPlacement(from)]),
          ...(to === null ? [] : [...entityChecked(to), facts.entityPlacement(to)]),
        ],
        writes: [facts.possession(itemId)],
      };
    }
  }
}
