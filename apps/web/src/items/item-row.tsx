import type { EquipSlot, InventoryItem } from '@ltw/contracts';
import { useT, type Language } from '@ltw/ui';
import { useId, useState } from 'react';

import { Glyph } from '../visual/glyph.tsx';
import { itemArtUrl } from '../visual/ui-kit.ts';
import type { ItemCommandBody } from './item-command.ts';
import type { Recipient } from './inventory-panel.tsx';
import {
  categoryName,
  effectText,
  formatWeight,
  kindDescription,
  kindName,
  slotName,
} from './item-text.ts';

/** One carried item and the actions it offers. Disabled actions say why in the sheet's note. */
export function ItemRow({
  item,
  language,
  blocked,
  recipients,
  expanded,
  onToggle,
  onRun,
}: {
  readonly item: InventoryItem;
  readonly language: Language;
  readonly blocked: boolean;
  readonly recipients: readonly Recipient[];
  readonly expanded: boolean;
  readonly onToggle: () => void;
  readonly onRun: (command: ItemCommandBody) => void;
}) {
  const t = useT();
  const id = useId();
  const [slot, setSlot] = useState<EquipSlot | null>(null);
  const [toHolderId, setToHolderId] = useState('');
  // How many of a stack to hand over or drop; everything unless chosen otherwise.
  const [amount, setAmount] = useState<number | null>(null);
  const howMany = Math.min(amount ?? item.quantity, item.quantity);
  const part = howMany < item.quantity ? { quantity: howMany } : {};
  const catalog = item.catalog;
  const art = item.catalog ? itemArtUrl(item.catalog.itemId) : null;
  const kind = kindName(item, language);
  const description = kindDescription(item, language) ?? item.description;
  const slots = catalog?.slots ?? [];
  const chosenSlot = slot ?? slots[0] ?? null;
  return (
    <li className="item-row">
      <button
        type="button"
        className="list-button item-summary"
        aria-expanded={expanded}
        aria-controls={`${id}-more`}
        onClick={onToggle}
      >
        {art ? (
          <img className="item-art" src={art} alt="" width={40} height={40} loading="lazy" />
        ) : (
          <Glyph name="use-item" />
        )}
        <span className="item-title">
          {item.name}
          {item.quantity > 1 && <span className="item-count"> ×{item.quantity}</span>}
        </span>
        <span className="item-meta">
          {item.slot !== null
            ? slotName(t, item.slot)
            : catalog
              ? categoryName(t, catalog.category)
              : t('Unique object')}
        </span>
      </button>
      {expanded && (
        <div id={`${id}-more`} className="item-more">
          {kind && kind !== item.name && <p className="item-kind">{kind}</p>}
          {description !== '' && <p>{description}</p>}
          <dl className="item-facts">
            {catalog && (
              <div>
                <dt>{t('Weight')}</dt>
                <dd>
                  {t('{weight} lb', { weight: formatWeight(catalog.weightLb * item.quantity) })}
                </dd>
              </div>
            )}
            {catalog?.effect && (
              <div>
                <dt>{t('Effect')}</dt>
                <dd>{effectText(t, catalog.effect)}</dd>
              </div>
            )}
          </dl>
          <div className="item-actions">
            {slots.length > 0 && item.slot === null && (
              <>
                {slots.length > 1 && (
                  <select
                    aria-label={t('Slot for {item}', { item: item.name })}
                    value={chosenSlot ?? ''}
                    onChange={(event) => {
                      setSlot(event.target.value as EquipSlot);
                    }}
                  >
                    {slots.map((option) => (
                      <option key={option} value={option}>
                        {slotName(t, option)}
                      </option>
                    ))}
                  </select>
                )}
                <button
                  type="button"
                  disabled={blocked || chosenSlot === null}
                  onClick={() => {
                    if (chosenSlot !== null)
                      onRun({ type: 'EquipItem', itemId: item.itemId, slot: chosenSlot });
                  }}
                >
                  {t('Wear')}
                </button>
              </>
            )}
            {item.slot !== null && (
              <button
                type="button"
                disabled={blocked}
                onClick={() => {
                  onRun({ type: 'UnequipItem', itemId: item.itemId });
                }}
              >
                {t('Take off')}
              </button>
            )}
            {catalog?.effect && (
              <button
                type="button"
                disabled={blocked}
                onClick={() => {
                  onRun({ type: 'UseItem', itemId: item.itemId });
                }}
              >
                {t('Use')}
              </button>
            )}
            {item.slot === null && item.quantity > 1 && (
              <select
                aria-label={t('How many of {item}', { item: item.name })}
                value={howMany}
                onChange={(event) => {
                  setAmount(Number(event.target.value));
                }}
              >
                {Array.from({ length: item.quantity }, (_, index) => index + 1).map((count) => (
                  <option key={count} value={count}>
                    {t('{count} of {total}', { count, total: item.quantity })}
                  </option>
                ))}
              </select>
            )}
            {item.slot === null && recipients.length > 0 && (
              <span className="item-give">
                <select
                  aria-label={t('Give {item} to', { item: item.name })}
                  value={toHolderId}
                  onChange={(event) => {
                    setToHolderId(event.target.value);
                  }}
                >
                  <option value="">{t('Choose who is here')}</option>
                  {recipients.map((person) => (
                    <option key={person.entityId} value={person.entityId}>
                      {person.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={blocked || toHolderId === ''}
                  onClick={() => {
                    onRun({ type: 'GiveItem', itemId: item.itemId, toHolderId, ...part });
                    setToHolderId('');
                  }}
                >
                  {t('Give')}
                </button>
              </span>
            )}
            {item.slot === null && (
              <button
                type="button"
                disabled={blocked}
                onClick={() => {
                  onRun({ type: 'DropItem', itemId: item.itemId, ...part });
                }}
              >
                {t('Drop')}
              </button>
            )}
          </div>
        </div>
      )}
    </li>
  );
}
