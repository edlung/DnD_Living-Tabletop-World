import { COINAGES, coinsFor, type Coin } from '@ltw/contracts';

import type { KernelEvent } from '../kernel/events.ts';
import type { WorldState } from '../kernel/state.ts';
import { itemEntry } from './catalog.ts';
import { carriedBy, possessionOf } from './records.ts';

/**
 * A holder's coins as trade spends and pays them (docs/adr/0057-encounters-maps-loot.md §8): every
 * coinage it carries pooled in copper. Spending takes all its coins and pays the change back in its
 * home coinage; paying adds to its stacks of each coin, or mints one. The home coinage is the one
 * it holds most worth of; with none, the one the world's coins are mostly in.
 */
interface CoinStack {
  readonly itemId: string;
  readonly catalogId: string;
  readonly quantity: number;
  readonly valueCp: number;
}

const coinOf = (catalogId: string | null): Coin | undefined =>
  catalogId === null ? undefined : COINAGES.flat().find((coin) => coin.catalogId === catalogId);

/** The coin stacks a holder carries, standing. */
export function coinStacks(state: WorldState, holderId: string): CoinStack[] {
  return carriedBy(state, holderId).flatMap((itemId) => {
    const possession = possessionOf(state, itemId);
    const coin = coinOf(possession?.catalogId ?? null);
    return possession?.slot === null && coin && state.entities.get(itemId)?.status === 'active'
      ? [
          {
            itemId,
            catalogId: coin.catalogId,
            quantity: possession.quantity,
            valueCp: coin.valueCp,
          },
        ]
      : [];
  });
}

export const purseCp = (state: WorldState, holderId: string): number =>
  coinStacks(state, holderId).reduce((sum, stack) => sum + stack.quantity * stack.valueCp, 0);

export function homeCoinage(state: WorldState, holderId: string): readonly Coin[] {
  const worth = (coins: readonly Coin[], stacks: readonly CoinStack[]) =>
    stacks
      .filter((stack) => coins.some((coin) => coin.catalogId === stack.catalogId))
      .reduce((sum, stack) => sum + stack.quantity * stack.valueCp, 0);
  const own = coinStacks(state, holderId);
  const world = [...state.possessions.keys()].flatMap((itemId) => {
    const coin = coinOf(possessionOf(state, itemId)?.catalogId ?? null);
    return coin ? [{ itemId, catalogId: coin.catalogId, quantity: 1, valueCp: 1 }] : [];
  });
  const ranked = [...COINAGES].sort(
    (a, b) => worth(b, own) - worth(a, own) || worth(b, world) - worth(a, world),
  );
  return ranked[0] ?? [];
}

/** A coin stack minted for a holder: its entity and its grant. */
function minted(
  state: WorldState,
  itemId: string,
  holderId: string,
  catalogId: string,
  count: number,
): KernelEvent[] {
  const language = state.campaign?.language === 'ru' ? 'ru' : 'en';
  const entry = itemEntry(catalogId);
  return [
    {
      type: 'EntityCreated',
      payload: {
        entityId: itemId,
        kind: 'item',
        name: entry?.name[language] ?? catalogId,
        description: entry?.description[language] ?? '',
        existsSince: null,
        location: null,
      },
    },
    { type: 'ItemGranted', payload: { itemId, holderId, catalogId, quantity: count } },
  ];
}

/**
 * Coins worth `worthCp` paid to a holder in its home coinage: added to a stack of each coin it
 * has, else minted with the IDs given. Null when the IDs run out.
 */
export function payCoins(
  state: WorldState,
  holderId: string,
  worthCp: number,
  ids: string[],
): KernelEvent[] | null {
  const stacks = coinStacks(state, holderId);
  const events: KernelEvent[] = [];
  for (const { catalogId, count } of coinsFor(homeCoinage(state, holderId), worthCp)) {
    const stack = stacks.find((one) => one.catalogId === catalogId);
    if (stack) {
      events.push({
        type: 'ItemStackChanged',
        payload: { itemId: stack.itemId, holderId, quantity: stack.quantity + count },
      });
      continue;
    }
    const itemId = ids.shift();
    if (itemId === undefined) return null;
    events.push(...minted(state, itemId, holderId, catalogId, count));
  }
  return events;
}

/**
 * `priceCp` spent from a holder's coins: every stack spent, the change minted back in its home
 * coinage with the IDs given. Null when its coins fall short or the IDs run out.
 */
export function spendCoins(
  state: WorldState,
  holderId: string,
  priceCp: number,
  ids: string[],
): KernelEvent[] | null {
  const stacks = coinStacks(state, holderId);
  const totalCp = stacks.reduce((sum, stack) => sum + stack.quantity * stack.valueCp, 0);
  if (totalCp < priceCp) return null;
  const home = homeCoinage(state, holderId);
  const events: KernelEvent[] = stacks.flatMap((stack): KernelEvent[] => [
    { type: 'ItemStackChanged', payload: { itemId: stack.itemId, holderId, quantity: 0 } },
    {
      type: 'EntityStatusChanged',
      payload: { entityId: stack.itemId, from: 'active', to: 'destroyed' },
    },
  ]);
  for (const { catalogId, count } of coinsFor(home, totalCp - priceCp)) {
    const itemId = ids.shift();
    if (itemId === undefined) return null;
    events.push(...minted(state, itemId, holderId, catalogId, count));
  }
  return events;
}
