import { COINAGES, coinsFor, splitWorth, type InventoryItem } from '@ltw/contracts';
import { useT } from '@ltw/ui';
import { useId, useState } from 'react';

import { coinWords } from '../coin-words.ts';
import type { Recipient } from '../inventory-panel.tsx';

/**
 * Coins shared out among the party here (docs/adr/0057-encounters-maps-loot.md §7): the members
 * chosen — the character too, unless left out — each get the same worth in the largest coins of
 * each coinage, with change made; what does not divide stays with the character. The words say
 * what each gets before anything moves; the World Engine decides.
 */
export function ShareCoins({
  items,
  self,
  members,
  blocked,
  onShare,
}: {
  readonly items: readonly InventoryItem[];
  readonly self: string;
  readonly members: readonly Recipient[];
  readonly blocked: boolean;
  readonly onShare: (amongIds: readonly string[]) => void;
}) {
  const t = useT();
  const ids = useId();
  const [left, setLeft] = useState<ReadonlySet<string>>(new Set());
  const worths = COINAGES.map((coinage) =>
    items.reduce(
      (sum, item) =>
        sum +
        (coinage.find((coin) => coin.catalogId === item.catalog?.itemId)?.valueCp ?? 0) *
          item.quantity,
      0,
    ),
  );
  if (members.length === 0 || worths.every((worth) => worth === 0)) return null;
  const everyone = [self, ...members.map((member) => member.entityId)];
  const among = everyone.filter((id) => !left.has(id));
  const toggle = (id: string, on: boolean) => {
    setLeft((known) => {
      const next = new Set(known);
      if (on) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const lines = COINAGES.flatMap((coinage, index) => {
    const worth = worths[index] ?? 0;
    if (worth === 0 || among.length === 0) return [];
    const { shareCp, restCp } = splitWorth(worth, among.length);
    if (shareCp === 0)
      return [
        t('Too few to share; left with you: {coins}', {
          coins: coinWords(t, coinsFor(coinage, restCp)),
        }),
      ];
    const share = t('Each gets: {coins}', { coins: coinWords(t, coinsFor(coinage, shareCp)) });
    return restCp === 0
      ? [share]
      : [share, t('Left with you: {coins}', { coins: coinWords(t, coinsFor(coinage, restCp)) })];
  });
  return (
    <details className="share-coins">
      <summary>{t('Share the coins out')}</summary>
      <fieldset className="share-coins-members">
        <legend>{t('Among')}</legend>
        {everyone.map((id) => {
          const name = members.find((member) => member.entityId === id)?.name ?? t('You');
          return (
            <div key={id} className="paint-brush">
              <input
                id={`${ids}-${id}`}
                type="checkbox"
                checked={!left.has(id)}
                onChange={(event) => {
                  toggle(id, event.target.checked);
                }}
              />
              <label htmlFor={`${ids}-${id}`}>{name}</label>
            </div>
          );
        })}
      </fieldset>
      <p className="field-hint share-coins-preview" role="status">
        {among.length === 0
          ? t('Choose who shares them.')
          : lines.map((line) => <span key={line}>{line}</span>)}
      </p>
      <button
        type="button"
        className="primary-button"
        disabled={blocked || among.length === 0}
        onClick={() => {
          onShare(among);
        }}
      >
        {t('Share them out')}
      </button>
    </details>
  );
}
