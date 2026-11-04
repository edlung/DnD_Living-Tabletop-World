import type { EquipSlot, InventoryItem } from '@ltw/contracts';
import { useT } from '@ltw/ui';
import { useState, type DragEvent } from 'react';

import { boardUrl, itemPictureUrl } from '../../visual/ui-kit.ts';
import { slotName } from '../item-text.ts';
import { DRAG_TYPE, draggedItem } from './drag.ts';

/** The slots down each side of the figure, as an equipment screen lays them out. */
const LEFT: readonly EquipSlot[] = ['head', 'neck', 'cloak', 'body'];
const RIGHT: readonly EquipSlot[] = ['mainhand', 'offhand', 'hands', 'ring', 'feet'];

/**
 * The paper doll (Stage 520): what the character wears, slot by slot, around the GPT figure
 * silhouette. A slot shows its item's catalog picture; choosing it shows the item. An item dragged
 * from the bag onto a slot that fits it is put on there (buttons in the item's card do the same).
 */
export function PaperDoll({
  worn,
  carried,
  selectedId,
  blocked,
  onSelect,
  onEquip,
}: {
  readonly worn: readonly InventoryItem[];
  readonly carried: readonly InventoryItem[];
  readonly selectedId: string | null;
  readonly blocked: boolean;
  readonly onSelect: (itemId: string) => void;
  readonly onEquip: (itemId: string, slot: EquipSlot) => void;
}) {
  const t = useT();
  const [over, setOver] = useState<EquipSlot | null>(null);
  // A slot takes a dragged item that fits it while the slot is free.
  const fits = (event: DragEvent, slot: EquipSlot) => {
    const item = draggedItem(event, carried);
    const free = !worn.some((entry) => entry.slot === slot);
    return free && (item?.catalog?.slots.includes(slot) ?? false);
  };
  const slotView = (slot: EquipSlot) => {
    const item = worn.find((entry) => entry.slot === slot);
    const art = item?.catalog ? itemPictureUrl(item.catalog) : null;
    const name = slotName(t, slot);
    return (
      <li
        key={slot}
        className={`doll-slot doll-slot--${slot}${over === slot ? ' is-over' : ''}`}
        onDragOver={(event) => {
          if (blocked || !event.dataTransfer.types.includes(DRAG_TYPE) || item) return;
          event.preventDefault();
          setOver(slot);
        }}
        onDragLeave={() => {
          setOver(null);
        }}
        onDrop={(event) => {
          setOver(null);
          const dropped = draggedItem(event, carried);
          if (!blocked && dropped && fits(event, slot)) {
            event.preventDefault();
            onEquip(dropped.itemId, slot);
          }
        }}
      >
        <button
          type="button"
          className={`doll-frame${item ? ' is-filled' : ''}${item && item.itemId === selectedId ? ' is-selected' : ''}`}
          aria-label={
            item
              ? t('{slot}: {item}', { slot: name, item: item.name })
              : t('{slot}: empty', { slot: name })
          }
          aria-pressed={item ? item.itemId === selectedId : undefined}
          disabled={!item}
          draggable={Boolean(item) && !blocked}
          onDragStart={(event) => {
            if (!item) return;
            event.dataTransfer.setData(DRAG_TYPE, item.itemId);
            event.dataTransfer.effectAllowed = 'move';
          }}
          onClick={() => {
            if (item) onSelect(item.itemId);
          }}
        >
          {art ? (
            <img src={art} alt="" draggable={false} />
          ) : (
            <span className="doll-empty" aria-hidden="true" />
          )}
        </button>
        <span className="doll-label" aria-hidden="true">
          {name}
        </span>
      </li>
    );
  };
  return (
    <section className="paper-doll" aria-label={t('Worn and wielded')}>
      <ul className="doll-side doll-side--left">{LEFT.map(slotView)}</ul>
      <div className="doll-figure" aria-hidden="true">
        <img src={boardUrl('figure-silhouette')} alt="" draggable={false} />
      </div>
      <ul className="doll-side doll-side--right">{RIGHT.map(slotView)}</ul>
    </section>
  );
}
