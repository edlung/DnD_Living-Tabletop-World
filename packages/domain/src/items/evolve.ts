import { CorruptHistoryError } from '../kernel/corrupt-history.ts';
import type { KernelEventType, RecordedEvent, Restore } from '../kernel/events.ts';
import { withEntry, withoutEntry } from '../kernel/maps.ts';
import type { WorldState } from '../kernel/state.ts';
import { applyCraftingEvent, applyCraftingRestore } from './crafting.ts';
import { possessionOf, type Possession } from './records.ts';

/** Fold and undo restore of item possession (docs/adr/0039-item-possession.md). */
type Ev<T extends RecordedEvent['type']> = Extract<RecordedEvent, { type: T }>;

const mustHold = (state: WorldState, itemId: string): Possession => {
  const found = possessionOf(state, itemId);
  if (!found) throw new CorruptHistoryError(`item ${itemId} has no possession`);
  return found;
};

/**
 * A possession of its required fields, and its optional ones only when set: the base a magic item
 * is made on, attunement and what it adds to saves (docs/adr/0054-items-as-data.md §5).
 */
const rebuilt = (
  core: Pick<Possession, 'catalogId' | 'holderId' | 'quantity' | 'slot' | 'acDelta'>,
  more: {
    readonly baseCatalogId?: string | undefined;
    readonly attuned?: boolean | undefined;
    readonly saveDelta?: number | undefined;
    readonly charges?: number | undefined;
    readonly unidentified?: boolean | undefined;
    readonly forSale?: boolean | undefined;
  },
): Possession => ({
  catalogId: core.catalogId,
  holderId: core.holderId,
  quantity: core.quantity,
  slot: core.slot,
  acDelta: core.acDelta,
  ...(more.baseCatalogId === undefined ? {} : { baseCatalogId: more.baseCatalogId }),
  ...(more.attuned === true ? { attuned: true as const } : {}),
  ...(more.saveDelta ? { saveDelta: more.saveDelta } : {}),
  ...(more.charges === undefined ? {} : { charges: more.charges }),
  ...(more.unidentified === true ? { unidentified: true as const } : {}),
  ...(more.forSale === true ? { forSale: true as const } : {}),
});

const put = (state: WorldState, itemId: string, value: Possession): WorldState => ({
  ...state,
  possessions: withEntry(state.possessions, itemId, value),
});

export function applyItemGranted(state: WorldState, event: Ev<'ItemGranted'>): WorldState {
  const { itemId, holderId, catalogId, quantity } = event.payload;
  if (state.entities.get(itemId)?.kind !== 'item')
    throw new CorruptHistoryError(`${itemId} is no item`);
  if (possessionOf(state, itemId)) throw new CorruptHistoryError(`item ${itemId} already held`);
  return put(
    state,
    itemId,
    rebuilt({ catalogId, holderId, quantity, slot: null, acDelta: 0 }, event.payload),
  );
}

export function applyItemEquipped(state: WorldState, event: Ev<'ItemEquipped'>): WorldState {
  const { itemId, holderId, slot, acDelta, saveDelta } = event.payload;
  const current = mustHold(state, itemId);
  if (current.holderId !== holderId || current.slot !== null)
    throw new CorruptHistoryError(`item ${itemId} cannot be equipped`);
  return put(state, itemId, { ...current, slot, acDelta, ...(saveDelta ? { saveDelta } : {}) });
}

/** Attunement begun or ended, and what the worn item gives from now on (ADR 0054 §5). */
export function applyItemAttuned(state: WorldState, event: Ev<'ItemAttuned'>): WorldState {
  const { itemId, holderId, attuned, acDelta, saveDelta } = event.payload;
  const current = mustHold(state, itemId);
  if (current.holderId !== holderId || (current.attuned === true) === attuned)
    throw new CorruptHistoryError(`item ${itemId} attunement does not follow`);
  return put(state, itemId, rebuilt({ ...current, acDelta }, { ...current, attuned, saveDelta }));
}

export function applyItemUnequipped(state: WorldState, event: Ev<'ItemUnequipped'>): WorldState {
  const { itemId, holderId, slot } = event.payload;
  const current = mustHold(state, itemId);
  if (current.holderId !== holderId || current.slot !== slot)
    throw new CorruptHistoryError(`item ${itemId} is not worn in ${slot}`);
  return put(
    state,
    itemId,
    rebuilt({ ...current, slot: null, acDelta: 0 }, { ...current, saveDelta: 0 }),
  );
}

export function applyItemUsed(state: WorldState, event: Ev<'ItemUsed'>): WorldState {
  const { itemId, holderId, remaining } = event.payload;
  const current = mustHold(state, itemId);
  if (current.holderId !== holderId || current.quantity !== remaining + 1)
    throw new CorruptHistoryError(`item ${itemId} use does not follow its quantity`);
  return put(state, itemId, { ...current, quantity: remaining });
}

/** A stack's count set anew as coins are exchanged (docs/adr/0057-encounters-maps-loot.md §7). */
function applyItemStackChanged(state: WorldState, event: Ev<'ItemStackChanged'>): WorldState {
  const { itemId, holderId, quantity } = event.payload;
  const current = mustHold(state, itemId);
  if (current.holderId !== holderId || current.slot !== null)
    throw new CorruptHistoryError(`item ${itemId} is not ${holderId}'s to change`);
  return put(state, itemId, { ...current, quantity });
}

export function applyItemRecovered(state: WorldState, event: Ev<'ItemRecovered'>): WorldState {
  const { itemId, holderId, recovered, quantity } = event.payload;
  const current = mustHold(state, itemId);
  if (current.holderId !== holderId || current.quantity + recovered !== quantity)
    throw new CorruptHistoryError(`item ${itemId} recovery does not follow its quantity`);
  return put(state, itemId, { ...current, quantity });
}

export function applyItemTransferred(state: WorldState, event: Ev<'ItemTransferred'>): WorldState {
  const { itemId, from, to, catalogId, quantity } = event.payload;
  const current = possessionOf(state, itemId);
  if (current && (current.holderId !== from || current.slot !== null))
    throw new CorruptHistoryError(`item ${itemId} was not carried by ${from ?? 'nobody'}`);
  // A thing changing hands is wares only when sold to a merchant (ADR 0057 §8).
  const { forSale } = event.payload;
  const moved: Possession = current
    ? { ...current, holderId: to }
    : { catalogId, holderId: to, quantity, slot: null, acDelta: 0 };
  const rest: Possession = { ...moved };
  delete (rest as { forSale?: true }).forSale;
  return put(state, itemId, forSale ? { ...rest, forSale: true } : rest);
}

export function applyItemSplit(state: WorldState, event: Ev<'ItemSplit'>): WorldState {
  const { itemId, newItemId, holderId, quantity } = event.payload;
  const current = mustHold(state, itemId);
  if (
    current.holderId !== holderId ||
    current.slot !== null ||
    current.quantity <= quantity ||
    state.entities.get(newItemId)?.kind !== 'item' ||
    possessionOf(state, newItemId)
  )
    throw new CorruptHistoryError(`item ${itemId} cannot be split`);
  return put(put(state, itemId, { ...current, quantity: current.quantity - quantity }), newItemId, {
    ...current,
    quantity,
  });
}

export function applyItemRestore(
  state: WorldState,
  restore: Extract<Restore, { fact: 'possession' | 'crafting' }>,
): WorldState {
  if (restore.fact === 'crafting') return applyCraftingRestore(state, restore);
  if (restore.value === null)
    return { ...state, possessions: withoutEntry(state.possessions, restore.itemId) };
  return put(state, restore.itemId, rebuilt(restore.value, restore.value));
}

/** A magic item's charges expended (docs/adr/0054-items-as-data.md §5). */
export function applyItemChargesSpent(
  state: WorldState,
  event: Ev<'ItemChargesSpent'>,
): WorldState {
  const { itemId, holderId, spent, left } = event.payload;
  const current = mustHold(state, itemId);
  if (current.holderId !== holderId || current.charges !== left + spent)
    throw new CorruptHistoryError(`item ${itemId} charges do not follow`);
  return put(state, itemId, { ...current, charges: left });
}

/** At dawn, its charges back by its dice (§5). */
export function applyItemChargesRegained(
  state: WorldState,
  event: Ev<'ItemChargesRegained'>,
): WorldState {
  const { itemId, charges } = event.payload;
  const current = mustHold(state, itemId);
  return put(state, itemId, { ...current, charges });
}

/** Its properties learnt (§5). */
export function applyItemIdentified(state: WorldState, event: Ev<'ItemIdentified'>): WorldState {
  const { itemId, holderId } = event.payload;
  const current = mustHold(state, itemId);
  if (current.holderId !== holderId || current.unidentified !== true)
    throw new CorruptHistoryError(`item ${itemId} was not unidentified`);
  return put(state, itemId, rebuilt(current, { ...current, unidentified: false }));
}

/**
 * The item events (docs/adr/0039-item-possession.md), crafting's among them (docs/adr/0057-
 * encounters-maps-loot.md §9), folded each by its own rule.
 */
const ITEM_EVENT_TYPES = [
  'ItemGranted',
  'ItemEquipped',
  'ItemUnequipped',
  'ItemUsed',
  'ItemStackChanged',
  'ItemAttuned',
  'ItemChargesSpent',
  'ItemChargesRegained',
  'ItemIdentified',
  'ItemRecovered',
  'ItemTransferred',
  'ItemSplit',
  'CraftingStarted',
  'CraftingWorked',
  'CraftingFinished',
  'CraftingAbandoned',
] as const satisfies readonly KernelEventType[];
export type ItemEventType = (typeof ITEM_EVENT_TYPES)[number];
const ITEM_EVENTS: ReadonlySet<string> = new Set(ITEM_EVENT_TYPES);

export const isItemEvent = <T extends { readonly type: string }>(
  event: T,
): event is Extract<T, { type: ItemEventType }> => ITEM_EVENTS.has(event.type);

export function applyItemEvent(state: WorldState, event: Ev<ItemEventType>): WorldState {
  switch (event.type) {
    case 'CraftingStarted':
    case 'CraftingWorked':
    case 'CraftingFinished':
    case 'CraftingAbandoned':
      return applyCraftingEvent(state, event);
    case 'ItemGranted':
      return applyItemGranted(state, event);
    case 'ItemEquipped':
      return applyItemEquipped(state, event);
    case 'ItemUnequipped':
      return applyItemUnequipped(state, event);
    case 'ItemUsed':
      return applyItemUsed(state, event);
    case 'ItemStackChanged':
      return applyItemStackChanged(state, event);
    case 'ItemAttuned':
      return applyItemAttuned(state, event);
    case 'ItemChargesSpent':
      return applyItemChargesSpent(state, event);
    case 'ItemChargesRegained':
      return applyItemChargesRegained(state, event);
    case 'ItemIdentified':
      return applyItemIdentified(state, event);
    case 'ItemRecovered':
      return applyItemRecovered(state, event);
    case 'ItemTransferred':
      return applyItemTransferred(state, event);
    case 'ItemSplit':
      return applyItemSplit(state, event);
  }
}
