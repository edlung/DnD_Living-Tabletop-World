import { entityIdSchema, type ItemEntry } from '@ltw/contracts';
import { z } from 'zod';

import { isCombatant } from '../combat/records.ts';
import { CorruptHistoryError } from '../kernel/corrupt-history.ts';
import { accept, reject, type Decision, type ResolvedCommandOf } from '../kernel/decision.ts';
import type { EntityState, WorldState } from '../kernel/state.ts';
import type { RecordedEvent, Restore } from '../kernel/events.ts';
import { withEntry, withoutEntry } from '../kernel/maps.ts';
import { mayHandle, ownItem, played, portion } from './handling.ts';
import { payCoins, spendCoins } from './purse.ts';
import { entryOf, possessionOf, type Possession } from './records.ts';

/**
 * Merchants (docs/adr/0057-encounters-maps-loot.md §8). The DM makes an NPC a merchant, its prices a
 * factor of the catalog's worth; what it sells is its wares — what the DM gave it for sale, and
 * what it bought — never its own things. A character at its place,
 * outside a fight, buys a stack or part of one at the price, its coins spent and the change made;
 * or sells what it carries unworn at half the worth (SRD 5.2.1 "Selling Equipment"), paid in its
 * coins. Coins and story things without a worth are never traded.
 */
export interface MerchantRecord {
  /** Its prices in percent of the catalog's worth. */
  readonly priceFactor: number;
}

const factor = z.number().int().min(25).max(500);
const record = z.object({ priceFactor: factor }).strict();

export const merchantSetPayloadSchema = z
  .object({ npcId: entityIdSchema, merchant: record.nullable() })
  .strict();

export const merchantRestoreSchemas = [
  z
    .object({ fact: z.literal('merchant'), npcId: entityIdSchema, value: record.nullable() })
    .strict(),
] as const;

/** A thing's price apiece from a merchant, in copper: never less than one. */
export const buyingPriceCp = (entry: ItemEntry, merchant: MerchantRecord): number =>
  Math.max(1, Math.ceil((entry.valueCp * merchant.priceFactor) / 100));

/** What a merchant pays apiece for a thing: half its worth, rounded down. */
export const sellingPriceCp = (entry: ItemEntry): number => Math.floor(entry.valueCp / 2);

/** A thing that trades: of the catalog, worth something, no coin. */
export const tradable = (possession: Possession | undefined): ItemEntry | null => {
  const entry = possession ? entryOf(possession) : undefined;
  return entry && entry.category !== 'coins' && entry.valueCp > 0 ? entry : null;
};

export function decideSetMerchant(
  state: WorldState,
  command: ResolvedCommandOf<'SetMerchant'>,
): Decision {
  const npc = state.entities.get(command.npcId);
  if (npc?.kind !== 'npc' || npc.status !== 'active')
    return reject('ENTITY_NOT_FOUND', 'Only an NPC keeps a shop');
  const before = state.merchants.get(command.npcId)?.priceFactor ?? null;
  if (before === command.priceFactor) return reject('NO_EFFECT', 'The shop is already so');
  return accept({
    type: 'MerchantSet',
    payload: {
      npcId: command.npcId,
      merchant: command.priceFactor === null ? null : { priceFactor: command.priceFactor },
    },
  });
}

/** The merchant at the character's place, or one answer for any other. */
function merchantHere(
  state: WorldState,
  merchantId: string,
  actor: EntityState,
): { readonly ok: true; readonly merchant: MerchantRecord } | (Decision & { ok: false }) {
  const npc = state.entities.get(merchantId);
  const merchant = state.merchants.get(merchantId);
  const here = actor.placement?.locationId;
  if (
    !merchant ||
    npc?.status !== 'active' ||
    here === undefined ||
    npc.placement?.locationId !== here
  )
    return reject('NOT_PRESENT', `"${merchantId}" sells nothing here`, { entityId: merchantId });
  return { ok: true, merchant };
}

const outsideFights = (state: WorldState, characterId: string) =>
  isCombatant(state, characterId)
    ? reject('COMBAT_ALREADY_ACTIVE', 'No trade while the fight runs')
    : null;

export function decideBuyItem(state: WorldState, command: ResolvedCommandOf<'BuyItem'>): Decision {
  const actor = mayHandle(state, command.characterId);
  if (!actor.ok) return actor;
  const fighting = outsideFights(state, command.characterId);
  if (fighting) return fighting;
  const shop = merchantHere(state, command.merchantId, actor.value);
  if (!shop.ok) return shop;
  const possession = possessionOf(state, command.itemId);
  const entry = tradable(possession);
  if (
    !possession ||
    !entry ||
    possession.holderId !== command.merchantId ||
    possession.forSale !== true ||
    possession.slot !== null
  )
    return reject('NOT_PRESENT', `"${command.itemId}" is not for sale`, { itemId: command.itemId });
  const [splitId, ...change] = command.resolution.ids;
  const part = portion(
    state,
    { ...command, characterId: command.merchantId, resolution: { ids: splitId ? [splitId] : [] } },
    possession,
  );
  if (!part.ok) return part;
  const spent = spendCoins(
    state,
    command.characterId,
    buyingPriceCp(entry, shop.merchant) * part.quantity,
    [...change],
  );
  if (!spent) return reject('ILLEGAL_ACTION', 'NOT_ENOUGH_COINS', { reason: 'NOT_ENOUGH_COINS' });
  return played(
    state,
    command.characterId,
    [{ kind: 'self' }, { kind: 'perceived', entityId: command.merchantId }],
    [
      ...spent,
      ...part.events,
      {
        type: 'ItemTransferred',
        payload: {
          itemId: part.itemId,
          from: command.merchantId,
          to: command.characterId,
          catalogId: possession.catalogId,
          quantity: part.quantity,
        },
      },
    ],
    'free',
  );
}

export function decideSellItem(
  state: WorldState,
  command: ResolvedCommandOf<'SellItem'>,
): Decision {
  const own = ownItem(state, command.characterId, command.itemId);
  if (!own.ok) return own;
  const fighting = outsideFights(state, command.characterId);
  if (fighting) return fighting;
  const shop = merchantHere(state, command.merchantId, own.actor);
  if (!shop.ok) return shop;
  const entry = tradable(own.possession);
  if (!entry || sellingPriceCp(entry) === 0)
    return reject('INVALID_ITEM', 'The merchant pays nothing for it', { itemId: command.itemId });
  if (own.possession.slot !== null)
    return reject('INVALID_ITEM', 'Take the item off before selling it');
  const [splitId, ...change] = command.resolution.ids;
  const part = portion(
    state,
    { ...command, resolution: { ids: splitId ? [splitId] : [] } },
    own.possession,
  );
  if (!part.ok) return part;
  const paid = payCoins(state, command.characterId, sellingPriceCp(entry) * part.quantity, [
    ...change,
  ]);
  if (!paid) return reject('INVALID_ITEM', 'Too many coins to count at once');
  return played(
    state,
    command.characterId,
    [{ kind: 'self' }, { kind: 'perceived', entityId: command.merchantId }],
    [
      ...part.events,
      {
        type: 'ItemTransferred',
        payload: {
          itemId: part.itemId,
          from: command.characterId,
          to: command.merchantId,
          catalogId: own.possession.catalogId,
          quantity: part.quantity,
          // The merchant sells it on (ADR 0057 §8).
          forSale: true,
        },
      },
      ...paid,
    ],
    'free',
  );
}

export function applyMerchantSet(
  state: WorldState,
  event: Extract<RecordedEvent, { type: 'MerchantSet' }>,
): WorldState {
  const { npcId, merchant } = event.payload;
  if (state.entities.get(npcId)?.kind !== 'npc')
    throw new CorruptHistoryError(`a shop for ${npcId}, no NPC`);
  return {
    ...state,
    merchants:
      merchant === null
        ? withoutEntry(state.merchants, npcId)
        : withEntry(state.merchants, npcId, merchant),
  };
}

export function applyMerchantRestore(
  state: WorldState,
  restore: Extract<Restore, { fact: 'merchant' }>,
): WorldState {
  return {
    ...state,
    merchants:
      restore.value === null
        ? withoutEntry(state.merchants, restore.npcId)
        : withEntry(state.merchants, restore.npcId, restore.value),
  };
}
