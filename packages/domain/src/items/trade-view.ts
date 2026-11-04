import { COINAGES, type MerchantOfferResponse } from '@ltw/contracts';

import type { WorldState } from '../kernel/state.ts';
import type { ResolvedPerspective } from '../knowledge/perspective.ts';
import { entityRef, knownEntityIds } from '../knowledge/projection.ts';
import { homeCoinage, purseCp } from './purse.ts';
import { carriedBy, possessionOf } from './records.ts';
import { buyingPriceCp, sellingPriceCp, tradable } from './trade.ts';
import { inventoryItem } from './view.ts';

/**
 * A merchant's offer (docs/adr/0057-encounters-maps-loot.md §8): to a character at its place that
 * knows it, or to the DM. Its wares — what it carries unworn that trades — each seen as the viewer may know it,
 * with a price apiece; what it would pay apiece for the viewer's own unworn things; the worth of
 * the viewer's coins. Null for anyone else, or an NPC that is no merchant.
 */
export function merchantOffer(
  state: WorldState,
  perspective: ResolvedPerspective,
  npcId: string,
): MerchantOfferResponse | null {
  const merchant = state.merchants.get(npcId);
  const npc = state.entities.get(npcId);
  if (!merchant || npc?.status !== 'active') return null;
  const dm = perspective.kind === 'DM';
  const viewerId = perspective.kind === 'CHARACTER' ? perspective.holderId : null;
  const here = viewerId === null ? undefined : state.entities.get(viewerId)?.placement?.locationId;
  if (
    !dm &&
    (here === undefined ||
      here !== npc.placement?.locationId ||
      !knownEntityIds(state, perspective).has(npcId))
  )
    return null;
  // Its wares; the viewer's own things, unworn.
  const unworn = (holderId: string, wares: boolean) =>
    carriedBy(state, holderId).flatMap((itemId) => {
      const possession = possessionOf(state, itemId);
      const entry =
        possession?.slot === null && (possession.forSale === true) === wares
          ? tradable(possession)
          : null;
      return entry ? [{ itemId, entry }] : [];
    });
  return {
    perspective: perspective.label,
    merchant: entityRef(state, npcId),
    priceFactor: merchant.priceFactor,
    stock: unworn(npcId, true).flatMap(({ itemId, entry }) => {
      const item = inventoryItem(state, dm, itemId);
      return item ? [{ ...item, priceCp: buyingPriceCp(entry, merchant) }] : [];
    }),
    offers:
      viewerId === null
        ? []
        : unworn(viewerId, false).flatMap(({ itemId, entry }) => {
            const item = inventoryItem(state, dm, itemId);
            return item && sellingPriceCp(entry) > 0
              ? [{ ...item, priceCp: sellingPriceCp(entry) }]
              : [];
          }),
    purseCp: viewerId === null ? 0 : purseCp(state, viewerId),
    coinage: Math.max(0, COINAGES.indexOf(homeCoinage(state, viewerId ?? npcId))),
  };
}
