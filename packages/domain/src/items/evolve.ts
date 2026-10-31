import { CorruptHistoryError } from '../kernel/corrupt-history.ts';
import type { RecordedEvent, Restore } from '../kernel/events.ts';
import { withEntry, withoutEntry } from '../kernel/maps.ts';
import type { WorldState } from '../kernel/state.ts';
import { possessionOf, type Possession } from './records.ts';

/** Fold and undo restore of item possession (docs/adr/0039-item-possession.md). */
type Ev<T extends RecordedEvent['type']> = Extract<RecordedEvent, { type: T }>;

const mustHold = (state: WorldState, itemId: string): Possession => {
  const found = possessionOf(state, itemId);
  if (!found) throw new CorruptHistoryError(`item ${itemId} has no possession`);
  return found;
};

const put = (state: WorldState, itemId: string, value: Possession): WorldState => ({
  ...state,
  possessions: withEntry(state.possessions, itemId, value),
});

export function applyItemGranted(state: WorldState, event: Ev<'ItemGranted'>): WorldState {
  const { itemId, holderId, catalogId, quantity } = event.payload;
  if (state.entities.get(itemId)?.kind !== 'item')
    throw new CorruptHistoryError(`${itemId} is no item`);
  if (possessionOf(state, itemId)) throw new CorruptHistoryError(`item ${itemId} already held`);
  return put(state, itemId, { catalogId, holderId, quantity, slot: null, acDelta: 0 });
}

export function applyItemEquipped(state: WorldState, event: Ev<'ItemEquipped'>): WorldState {
  const { itemId, holderId, slot, acDelta } = event.payload;
  const current = mustHold(state, itemId);
  if (current.holderId !== holderId || current.slot !== null)
    throw new CorruptHistoryError(`item ${itemId} cannot be equipped`);
  return put(state, itemId, { ...current, slot, acDelta });
}

export function applyItemUnequipped(state: WorldState, event: Ev<'ItemUnequipped'>): WorldState {
  const { itemId, holderId, slot } = event.payload;
  const current = mustHold(state, itemId);
  if (current.holderId !== holderId || current.slot !== slot)
    throw new CorruptHistoryError(`item ${itemId} is not worn in ${slot}`);
  return put(state, itemId, { ...current, slot: null, acDelta: 0 });
}

export function applyItemUsed(state: WorldState, event: Ev<'ItemUsed'>): WorldState {
  const { itemId, holderId, remaining } = event.payload;
  const current = mustHold(state, itemId);
  if (current.holderId !== holderId || current.quantity !== remaining + 1)
    throw new CorruptHistoryError(`item ${itemId} use does not follow its quantity`);
  return put(state, itemId, { ...current, quantity: remaining });
}

export function applyItemTransferred(state: WorldState, event: Ev<'ItemTransferred'>): WorldState {
  const { itemId, from, to, catalogId, quantity } = event.payload;
  const current = possessionOf(state, itemId);
  if (current && (current.holderId !== from || current.slot !== null))
    throw new CorruptHistoryError(`item ${itemId} was not carried by ${from ?? 'nobody'}`);
  return put(
    state,
    itemId,
    current
      ? { ...current, holderId: to }
      : { catalogId, holderId: to, quantity, slot: null, acDelta: 0 },
  );
}

export function applyItemRestore(
  state: WorldState,
  restore: Extract<Restore, { fact: 'possession' }>,
): WorldState {
  return restore.value === null
    ? { ...state, possessions: withoutEntry(state.possessions, restore.itemId) }
    : put(state, restore.itemId, restore.value);
}
