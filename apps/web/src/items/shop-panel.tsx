import type { InventoryItem, MerchantOfferResponse } from '@ltw/contracts';
import { StatusPanel, useLanguage, useT } from '@ltw/ui';
import { useCallback, useId } from 'react';

import type { WorldApi } from '../api/client.ts';
import { useResource } from '../api/resource.ts';
import type { ExplorationIntent } from '../exploration/use-action.ts';
import { useRereadOn } from '../world/use-world-data.ts';
import { worthIn } from './coin-words.ts';
import { kindName } from './item-text.ts';

/**
 * A merchant's shop (docs/adr/0057-encounters-maps-loot.md §8), opened from Trade: its wares, each
 * with its price apiece and a way to buy one; what it would pay for each thing the character
 * carries unworn, and a way to sell one; the worth of the character's coins. Prices are in the
 * coins the character mostly carries; the World Engine takes the coins and makes the change. A ware
 * the coins do not reach says so beside its Buy, which stays off.
 */
export function ShopPanel({
  api,
  characterId,
  merchantId,
  locked,
  revision,
  onRun,
}: {
  readonly api: WorldApi;
  readonly characterId: string;
  readonly merchantId: string;
  readonly locked: boolean;
  /** The screen's action count: the shop is read again after the player's own trade. */
  readonly revision: number;
  readonly onRun: (intent: ExplorationIntent) => void;
}) {
  const t = useT();
  const language = useLanguage();
  const ids = useId();
  const load = useCallback(
    (signal: AbortSignal) =>
      api.get<MerchantOfferResponse>(`merchants/${encodeURIComponent(merchantId)}`, signal),
    [api, merchantId],
  );
  const { resource, reread, retry } = useResource(`shop:${merchantId}`, load);
  useRereadOn(revision, reread);
  if (resource.status !== 'ready') {
    return (
      <StatusPanel
        state={resource.status === 'error' ? 'error' : 'loading'}
        label={resource.status === 'error' ? resource.message : t('Opening the shop…')}
        onRetry={retry}
      />
    );
  }
  const offer = resource.value;
  const price = (cp: number) => worthIn(t, cp, offer.coinage);
  const named = (item: InventoryItem) => kindName(item, language) ?? item.name;
  const trade = (type: 'BuyItem' | 'SellItem', itemId: string) => {
    onRun({
      kind: 'command',
      command: { type, characterId, merchantId, itemId, quantity: 1 },
    });
  };
  return (
    <section className="shop" aria-labelledby={`${ids}-wares`}>
      <p className="shop-purse">
        {t('Your coins: {worth}', { worth: price(offer.purseCp) || t('none') })}
      </p>
      <h4 id={`${ids}-wares`}>{t('For sale')}</h4>
      {offer.stock.length === 0 ? (
        <p className="muted">{t('Nothing for sale right now.')}</p>
      ) : (
        <ul className="shop-list">
          {offer.stock.map((item) => {
            const short = item.priceCp > offer.purseCp;
            const shortId = `${ids}-short-${item.itemId}`;
            return (
              <li key={item.itemId}>
                <span className="shop-name">
                  {item.quantity > 1
                    ? t('{item}, {count}', { item: named(item), count: item.quantity })
                    : named(item)}
                  {short && (
                    <small id={shortId} className="shop-short">
                      {t('Not enough coins')}
                    </small>
                  )}
                </span>
                <span className="shop-price">{price(item.priceCp)}</span>
                <button
                  type="button"
                  disabled={locked || short}
                  aria-describedby={short ? shortId : undefined}
                  aria-label={t('Buy {item} for {price}', {
                    item: named(item),
                    price: price(item.priceCp),
                  })}
                  onClick={() => {
                    trade('BuyItem', item.itemId);
                  }}
                >
                  {t('Buy')}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <h4>{t('What they would pay you')}</h4>
      {offer.offers.length === 0 ? (
        <p className="muted">{t('You carry nothing they would buy.')}</p>
      ) : (
        <ul className="shop-list">
          {offer.offers.map((item) => (
            <li key={item.itemId}>
              <span className="shop-name">
                {item.quantity > 1
                  ? t('{item}, {count}', { item: named(item), count: item.quantity })
                  : named(item)}
              </span>
              <span className="shop-price">{price(item.priceCp)}</span>
              <button
                type="button"
                disabled={locked}
                aria-label={t('Sell {item} for {price}', {
                  item: named(item),
                  price: price(item.priceCp),
                })}
                onClick={() => {
                  trade('SellItem', item.itemId);
                }}
              >
                {t('Sell')}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
