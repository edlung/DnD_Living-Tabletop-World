import type { InventoryItem, ItemCategory } from '@ltw/contracts';
import { useT } from '@ltw/ui';
import { useState } from 'react';

import { Glyph } from '../../visual/glyph.tsx';
import { itemArtUrl } from '../../visual/ui-kit.ts';
import { categoryName, formatWeight } from '../item-text.ts';
import { DRAG_TYPE, draggedItem } from './drag.ts';

const ORDER: readonly ItemCategory[] = [
  'weapon',
  'armor',
  'shield',
  'consumable',
  'gear',
  'tool',
  'coins',
];

/**
 * The bag (Stage 520): what the character carries and does not wear, as picture tiles with their
 * counts, filtered by kind. A tile dragged onto the paper doll is put on; something worn dragged back
 * here is taken off.
 */
export function Bag({
  carried,
  worn,
  selectedId,
  blocked,
  onSelect,
  onUnequip,
}: {
  readonly carried: readonly InventoryItem[];
  readonly worn: readonly InventoryItem[];
  readonly selectedId: string | null;
  readonly blocked: boolean;
  readonly onSelect: (itemId: string) => void;
  readonly onUnequip: (itemId: string) => void;
}) {
  const t = useT();
  const [filter, setFilter] = useState<ItemCategory | 'all'>('all');
  const [over, setOver] = useState(false);
  const kinds = ORDER.filter((kind) => carried.some((item) => item.catalog?.category === kind));
  const shown =
    filter === 'all' || !kinds.includes(filter)
      ? carried
      : carried.filter((item) => item.catalog?.category === filter);
  return (
    <section
      className={`bag${over ? ' is-over' : ''}`}
      aria-label={t('Carried')}
      onDragOver={(event) => {
        if (blocked || !event.dataTransfer.types.includes(DRAG_TYPE)) return;
        event.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => {
        setOver(false);
      }}
      onDrop={(event) => {
        setOver(false);
        const dropped = draggedItem(event, worn);
        if (!blocked && dropped) {
          event.preventDefault();
          onUnequip(dropped.itemId);
        }
      }}
    >
      {kinds.length > 1 && (
        <div className="bag-filters" role="group" aria-label={t('Show')}>
          {(['all', ...kinds] as const).map((kind) => (
            <button
              key={kind}
              type="button"
              className="bag-filter"
              aria-pressed={(filter === 'all' || !kinds.includes(filter) ? 'all' : filter) === kind}
              onClick={() => {
                setFilter(kind);
              }}
            >
              {kind === 'all' ? t('Everything') : categoryName(t, kind)}
            </button>
          ))}
        </div>
      )}
      {shown.length === 0 ? (
        <p className="muted">{t('Nothing else in the bag.')}</p>
      ) : (
        <ul className="bag-grid">
          {shown.map((item) => {
            const art = item.catalog ? itemArtUrl(item.catalog.itemId) : null;
            const weight = item.catalog ? item.catalog.weightLb * item.quantity : null;
            return (
              <li key={item.itemId}>
                <button
                  type="button"
                  className="bag-tile"
                  aria-pressed={item.itemId === selectedId}
                  aria-label={
                    item.quantity > 1
                      ? t('{item}, {count}', { item: item.name, count: item.quantity })
                      : item.name
                  }
                  draggable={!blocked && (item.catalog?.slots.length ?? 0) > 0}
                  onDragStart={(event) => {
                    event.dataTransfer.setData(DRAG_TYPE, item.itemId);
                    event.dataTransfer.effectAllowed = 'move';
                  }}
                  onClick={() => {
                    onSelect(item.itemId);
                  }}
                >
                  <span className="bag-art" aria-hidden="true">
                    {art ? <img src={art} alt="" draggable={false} /> : <Glyph name="use-item" />}
                    {item.quantity > 1 && <span className="bag-count">{item.quantity}</span>}
                  </span>
                  <span className="bag-name" aria-hidden="true">
                    {item.name}
                  </span>
                  {weight !== null && (
                    <span className="bag-weight" aria-hidden="true">
                      {t('{weight} lb', { weight: formatWeight(weight) })}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
