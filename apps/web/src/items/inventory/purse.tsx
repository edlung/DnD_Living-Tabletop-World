import type { InventoryItem } from '@ltw/contracts';
import { useLanguage, useT, type Translate } from '@ltw/ui';

import { itemArtUrl } from '../../visual/ui-kit.ts';
import { roundWeight } from '../item-text.ts';

/** The coins of Ravenford, largest first, with their worth in pennies. */
const COINS = [
  { catalogId: 'gold-crown', amount: '{count} cr', name: 'Crowns', value: 100 },
  { catalogId: 'silver-mark', amount: '{count} m', name: 'Marks', value: 10 },
  { catalogId: 'copper-penny', amount: '{count} p', name: 'Pennies', value: 1 },
] as const;

/** A worth in pennies as coins, largest first: "15 cr · 3 m · 4 p". */
export function worthWords(t: Translate, pennies: number): string {
  // To the hundredth of a penny: a sling bullet is worth a fifth of one (SRD 5.2.1).
  let left = Math.round(pennies * 100) / 100;
  const parts: string[] = [];
  for (const coin of COINS) {
    const last = coin.value === 1;
    const count = last ? left : Math.floor(left / coin.value);
    left = Math.round((left - count * coin.value) * 100) / 100;
    if (count > 0) parts.push(t(coin.amount, { count }));
  }
  return parts.length === 0 ? t('{count} p', { count: 0 }) : parts.join(' · ');
}

/**
 * The purse and the load (Stage 520): how many of each coin the character carries, and the pack's
 * weight against what its Strength carries (shown, never enforced: ADR 0039).
 */
export function PurseAndLoad({
  items,
  totalWeightLb,
  capacityLb,
}: {
  readonly items: readonly InventoryItem[];
  readonly totalWeightLb: number;
  readonly capacityLb: number | null;
}) {
  const t = useT();
  const language = useLanguage();
  const coins = COINS.map((coin) => ({
    ...coin,
    count: items
      .filter((item) => item.catalog?.itemId === coin.catalogId)
      .reduce((sum, item) => sum + item.quantity, 0),
  }));
  // Other coins carried — the SRD's, by their own names (docs/adr/0054-items-as-data.md §3).
  const own = new Set<string>(COINS.map((coin) => coin.catalogId));
  const others = new Map<string, { name: string; count: number; english: boolean }>();
  for (const item of items) {
    const catalog = item.catalog;
    if (catalog?.category !== 'coins' || own.has(catalog.itemId)) continue;
    const before = others.get(catalog.itemId);
    others.set(catalog.itemId, {
      name: catalog.name[language === 'ru' ? 'ru' : 'en'],
      count: (before?.count ?? 0) + item.quantity,
      english: language === 'ru' && catalog.untranslated,
    });
  }
  const share = capacityLb ? Math.min(100, (100 * totalWeightLb) / capacityLb) : 0;
  const heavy = capacityLb !== null && totalWeightLb > capacityLb;
  return (
    <div className="purse-load">
      <section className="purse" aria-label={t('Purse')}>
        <ul>
          {coins.map((coin) => {
            const art = itemArtUrl(coin.catalogId);
            return (
              <li
                key={coin.catalogId}
                className={`purse-coin${coin.count === 0 ? ' is-empty' : ''}`}
              >
                {art && <img src={art} alt="" />}
                <span className="purse-count">{coin.count}</span>
                <span className="purse-name">{t(coin.name)}</span>
              </li>
            );
          })}
          {[...others].map(([catalogId, coin]) => (
            <li key={catalogId} className="purse-coin">
              <span className="purse-count">{coin.count}</span>
              <span className="purse-name" lang={coin.english ? 'en' : undefined}>
                {coin.name}
              </span>
            </li>
          ))}
        </ul>
      </section>
      <section className={`load${heavy ? ' is-heavy' : ''}`} aria-label={t('Load')}>
        <p className="load-line">
          <span>{t('Load')}</span>
          <span>
            {capacityLb
              ? t('{weight} of {capacity} lb', {
                  weight: roundWeight(totalWeightLb),
                  capacity: capacityLb,
                })
              : t('{weight} lb', { weight: roundWeight(totalWeightLb) })}
          </span>
        </p>
        {capacityLb !== null && (
          <span className="load-bar" aria-hidden="true">
            <span style={{ width: `${String(share)}%` }} />
          </span>
        )}
        {heavy && <p className="field-hint">{t('More than your Strength carries comfortably.')}</p>}
      </section>
    </div>
  );
}
