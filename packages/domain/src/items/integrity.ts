import type { WorldState } from '../kernel/state.ts';
import { itemEntry } from './catalog.ts';

/** Structural invariants of item possession (docs/adr/0039-item-possession.md). */
export function itemViolations(state: WorldState): string[] {
  const violations: string[] = [];
  const report = (message: string) => violations.push(message);
  const wornSlots = new Set<string>();
  for (const [itemId, possession] of state.possessions) {
    const entry = possession.catalogId === null ? undefined : itemEntry(possession.catalogId);
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
    } else if (possession.acDelta !== 0) {
      report(`unworn item ${itemId} adds armor class`);
    }
  }
  return violations;
}
