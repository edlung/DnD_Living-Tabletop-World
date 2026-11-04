import type { MerchantOfferResponse } from '@ltw/contracts';
import { useT } from '@ltw/ui';
import { useCallback, useId } from 'react';

import type { WorldApi } from '../api/client.ts';
import { useResource } from '../api/resource.ts';
import type { ExplorationIntent } from '../exploration/use-action.ts';
import { GiveItemForm } from '../items/give-item-form.tsx';
import { useRereadOn } from '../world/use-world-data.ts';

/** The prices a shop may ask, in percent of the catalog's worth. */
const FACTORS = [50, 75, 100, 125, 150, 200, 300] as const;

/**
 * The DM's hand on an NPC's shop (docs/adr/0057-encounters-maps-loot.md §8): whether it keeps one,
 * at what prices, and its wares — what it carries, given from the catalog. Players at its place
 * then Trade with it.
 */
export function NpcShop({
  api,
  npcId,
  locked,
  revision,
  onRun,
}: {
  readonly api: WorldApi;
  readonly npcId: string;
  readonly locked: boolean;
  /** The screen's action count: the shop is read again after the DM's own action. */
  readonly revision: number;
  readonly onRun: (intent: ExplorationIntent) => void;
}) {
  const t = useT();
  const ids = useId();
  const load = useCallback(
    (signal: AbortSignal) =>
      api
        .get<MerchantOfferResponse>(`merchants/${encodeURIComponent(npcId)}`, signal)
        .catch(() => null),
    [api, npcId],
  );
  const { resource, reread } = useResource(`npc-shop:${npcId}`, load);
  useRereadOn(revision, reread);
  const offer = resource.status === 'ready' ? resource.value : null;
  const factor = offer?.priceFactor ?? null;
  return (
    <section className="npc-shop" aria-labelledby={`${ids}-title`}>
      <h3 id={`${ids}-title`}>{t('Shop')}</h3>
      <div className="account-field">
        <label htmlFor={`${ids}-factor`}>{t('Keeps a shop')}</label>
        <select
          id={`${ids}-factor`}
          value={factor === null ? '' : String(factor)}
          disabled={locked || resource.status === 'loading'}
          onChange={(event) => {
            const next = event.target.value === '' ? null : Number(event.target.value);
            onRun({ kind: 'command', command: { type: 'SetMerchant', npcId, priceFactor: next } });
          }}
        >
          <option value="">{t('No shop')}</option>
          {FACTORS.map((percent) => (
            <option key={percent} value={percent}>
              {t('Prices at {percent}% of the worth', { percent })}
            </option>
          ))}
        </select>
      </div>
      {offer && (
        <p className="muted">
          {offer.stock.length === 0
            ? t('Nothing for sale yet: give it wares from the catalog.')
            : t('For sale: {items}.', {
                items: offer.stock
                  .map((item) =>
                    item.quantity > 1
                      ? t('{item}, {count}', { item: item.name, count: item.quantity })
                      : item.name,
                  )
                  .join('; '),
              })}
        </p>
      )}
      {offer && <GiveItemForm api={api} holderId={npcId} locked={locked} forSale />}
    </section>
  );
}
