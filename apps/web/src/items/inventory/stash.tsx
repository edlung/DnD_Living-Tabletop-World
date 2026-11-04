import type { InventoryItem } from '@ltw/contracts';
import { useT } from '@ltw/ui';
import { useId } from 'react';

/**
 * The party's stash (docs/adr/0057-encounters-maps-loot.md §7), below a member's pack: what any
 * member put there for all, each stack taken whole by whoever needs it — wherever they are, outside
 * a fight. An item goes in from its card ("Put in the stash").
 */
export function PartyStash({
  items,
  blocked,
  onTake,
}: {
  readonly items: readonly InventoryItem[];
  readonly blocked: boolean;
  readonly onTake: (itemId: string) => void;
}) {
  const t = useT();
  const ids = useId();
  return (
    <section className="party-stash" aria-labelledby={`${ids}-title`}>
      <h3 id={`${ids}-title`}>{t('The party’s stash')}</h3>
      {items.length === 0 ? (
        <p className="muted">{t('Nothing in the stash yet: put things in from their card.')}</p>
      ) : (
        <ul className="party-stash-list">
          {items.map((item) => (
            <li key={item.itemId}>
              <span>
                {item.quantity > 1
                  ? t('{item}, {count}', { item: item.name, count: item.quantity })
                  : item.name}
              </span>
              <button
                type="button"
                disabled={blocked}
                aria-label={t('Take {item} from the stash', { item: item.name })}
                onClick={() => {
                  onTake(item.itemId);
                }}
              >
                {t('Take')}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
