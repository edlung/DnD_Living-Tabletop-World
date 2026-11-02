import type { WorldState } from '../kernel/state.ts';
import { entryOf } from './records.ts';

/** Structural invariants of item possession (docs/adr/0039-item-possession.md). */
export function itemViolations(state: WorldState): string[] {
  const violations: string[] = [];
  const report = (message: string) => violations.push(message);
  const wornSlots = new Set<string>();
  const attunedBy = new Map<string, number>();
  for (const [itemId, possession] of state.possessions) {
    // A magic one made on a base, with the base's numbers (docs/adr/0054-items-as-data.md §5).
    const entry = entryOf(possession);
    const entity = state.entities.get(itemId);
    if (entity?.kind !== 'item') report(`possession of non-item ${itemId}`);
    if (possession.catalogId !== null && !entry) report(`item ${itemId} has an unknown catalog ID`);
    if (possession.quantity > 1 && !entry?.stackable)
      report(`item ${itemId} stacks without a stackable entry`);
    if ((possession.quantity === 0) !== (entity?.status === 'destroyed'))
      report(`item ${itemId} quantity and status disagree`);
    if (possession.holderId !== null) {
      const holder = state.entities.get(possession.holderId)?.kind;
      if (holder !== 'character' && holder !== 'npc')
        report(`item ${itemId} has an invalid holder`);
    }
    if (possession.slot !== null) {
      if (possession.holderId === null) report(`item ${itemId} is worn by nobody`);
      if (!entry?.slots.includes(possession.slot)) report(`item ${itemId} is worn in a wrong slot`);
      const key = `${possession.holderId ?? ''}:${possession.slot}`;
      if (wornSlots.has(key)) report(`two items share ${key}`);
      wornSlots.add(key);
    } else if (possession.acDelta !== 0 || (possession.saveDelta ?? 0) !== 0) {
      report(`unworn item ${itemId} adds armor class or saves`);
    }
    // Attunement (docs/adr/0054-items-as-data.md §5): to what needs it, three at most.
    if (possession.attuned) {
      if (entry?.magic?.attunement === undefined || entry.magic.attunement === null)
        report(`item ${itemId} is attuned but needs no attunement`);
      const holder = possession.holderId ?? '';
      attunedBy.set(holder, (attunedBy.get(holder) ?? 0) + 1);
    }
  }
  for (const [holder, count] of attunedBy)
    if (count > 3) report(`${holder} is attuned to ${String(count)} items`);
  return violations;
}
