import type { EquipSlot, InventoryItem, InventoryWeapon } from '@ltw/contracts';
import { readableLabel, useT, type Language } from '@ltw/ui';
import { useId, useState } from 'react';

import { diceWords, signed } from '../../character/words.ts';
import { Glyph } from '../../visual/glyph.tsx';
import { itemArtUrl } from '../../visual/ui-kit.ts';
import type { ItemCommandBody } from '../item-command.ts';
import type { Recipient } from '../inventory-panel.tsx';
import {
  categoryName,
  effectText,
  formatWeight,
  kindDescription,
  kindName,
  slotName,
} from '../item-text.ts';
import { worthWords } from './purse.tsx';

/**
 * The chosen item's card (Stage 520): its picture, what it is, its numbers (weight, worth, armor,
 * the weapon's attack with this character's bonuses), and the actions the World Engine allows.
 */
export function ItemCard({
  item,
  worn,
  weapon,
  language,
  blocked,
  recipients,
  onRun,
}: {
  readonly item: InventoryItem;
  /** What is worn now: a slot already taken is said, with a way to free it. */
  readonly worn: readonly InventoryItem[];
  /** The weapon's attack for this character, when the item is a weapon. */
  readonly weapon: InventoryWeapon | null;
  readonly language: Language;
  readonly blocked: boolean;
  readonly recipients: readonly Recipient[];
  readonly onRun: (command: ItemCommandBody) => void;
}) {
  const t = useT();
  const id = useId();
  const [slot, setSlot] = useState<EquipSlot | null>(null);
  const [toHolderId, setToHolderId] = useState('');
  const [amount, setAmount] = useState<number | null>(null);
  const howMany = Math.min(amount ?? item.quantity, item.quantity);
  const part = howMany < item.quantity ? { quantity: howMany } : {};
  const catalog = item.catalog;
  const art = catalog ? itemArtUrl(catalog.itemId) : null;
  const kind = kindName(item, language);
  // The SRD's words still in English in a Russian campaign (Stage 650e translates them).
  const english = language === 'ru' && catalog?.untranslated === true;
  const description = kindDescription(item, language) ?? item.description;
  const slots = catalog?.slots ?? [];
  // The first free slot the item fits, unless one was chosen.
  const occupantOf = (option: EquipSlot) => worn.find((entry) => entry.slot === option) ?? null;
  const chosenSlot = slot ?? slots.find((option) => !occupantOf(option)) ?? slots[0] ?? null;
  const occupant = chosenSlot && item.slot === null ? occupantOf(chosenSlot) : null;
  return (
    <article className="item-card" aria-labelledby={`${id}-name`}>
      <div className="item-card-art">
        {art ? <img src={art} alt="" /> : <Glyph name="use-item" />}
      </div>
      <div className="item-card-body">
        <h3 id={`${id}-name`}>
          {item.name}
          {item.quantity > 1 && <span className="item-count"> ×{item.quantity}</span>}
        </h3>
        <p className="item-card-kind">
          {kind && kind !== item.name && (
            <>
              <span lang={english ? 'en' : undefined}>{kind}</span>
              {' · '}
            </>
          )}
          {[
            catalog ? categoryName(t, catalog.category) : t('Unique object'),
            item.slot ? t('Worn: {slot}', { slot: slotName(t, item.slot) }) : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
        {/* An SRD entry's own words say more than its line (docs/adr/0054-items-as-data.md §4). */}
        {catalog?.text ? (
          <p className="item-srd-words" lang="en">
            {catalog.text}
          </p>
        ) : (
          description !== '' && <p lang={english ? 'en' : undefined}>{description}</p>
        )}
        <dl className="item-facts">
          {weapon && (
            <>
              <div>
                <dt>{t('To hit')}</dt>
                <dd>{signed(weapon.attackBonus)}</dd>
              </div>
              <div>
                <dt>{t('Damage')}</dt>
                <dd>
                  {diceWords(weapon.damage)} {t(readableLabel(weapon.damageType))}
                </dd>
              </div>
              <div>
                <dt>{t('Range')}</dt>
                <dd>
                  {weapon.ranged
                    ? t('{normal}/{long} ft', {
                        normal: weapon.normalRangeFt,
                        long: weapon.longRangeFt,
                      })
                    : t('Reach {feet} ft', { feet: weapon.normalRangeFt })}
                </dd>
              </div>
              {weapon.properties.length > 0 && (
                <div>
                  <dt>{t('Properties')}</dt>
                  <dd>
                    {weapon.properties.map((property) => t(readableLabel(property))).join(', ')}
                  </dd>
                </div>
              )}
            </>
          )}
          {catalog?.armor && (
            <div>
              <dt>{t('Armor class')}</dt>
              <dd>
                {catalog.armor.dexCap === null
                  ? t('{base} + Dexterity', { base: catalog.armor.baseAc })
                  : catalog.armor.dexCap === 0
                    ? String(catalog.armor.baseAc)
                    : t('{base} + Dexterity (up to {cap})', {
                        base: catalog.armor.baseAc,
                        cap: catalog.armor.dexCap,
                      })}
              </dd>
            </div>
          )}
          {catalog?.shieldBonus !== undefined && catalog.shieldBonus !== null && (
            <div>
              <dt>{t('Armor class')}</dt>
              <dd>{t('+{bonus} while held', { bonus: catalog.shieldBonus })}</dd>
            </div>
          )}
          {catalog?.effect && (
            <div>
              <dt>{t('What it does')}</dt>
              <dd>{effectText(t, catalog.effect)}</dd>
            </div>
          )}
          {catalog && (
            <div>
              <dt>{t('Weight')}</dt>
              <dd>
                {t('{weight} lb', { weight: formatWeight(catalog.weightLb * item.quantity) })}
              </dd>
            </div>
          )}
          {catalog && catalog.valueCp > 0 && (
            <div>
              <dt>{t('Worth')}</dt>
              <dd>{worthWords(t, catalog.valueCp * item.quantity)}</dd>
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
                className="primary-button"
                disabled={blocked || chosenSlot === null || occupant !== null}
                aria-describedby={occupant ? `${id}-taken` : undefined}
                onClick={() => {
                  if (chosenSlot !== null)
                    onRun({ type: 'EquipItem', itemId: item.itemId, slot: chosenSlot });
                }}
              >
                {catalog?.category === 'weapon' || catalog?.category === 'shield'
                  ? t('Wield')
                  : t('Wear')}
              </button>
              {occupant && chosenSlot && (
                <>
                  <span id={`${id}-taken`} className="item-taken">
                    {t('{slot} holds {item}.', {
                      slot: slotName(t, chosenSlot),
                      item: occupant.name,
                    })}
                  </span>
                  <button
                    type="button"
                    disabled={blocked}
                    onClick={() => {
                      onRun({ type: 'UnequipItem', itemId: occupant.itemId });
                    }}
                  >
                    {t('Take off {item}', { item: occupant.name })}
                  </button>
                </>
              )}
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
              className="primary-button"
              disabled={blocked}
              onClick={() => {
                onRun({ type: 'UseItem', itemId: item.itemId });
              }}
            >
              {t('Use')}
            </button>
          )}
          {item.slot === null && item.quantity > 1 && (
            <label className="item-amount">
              <span>{t('How many')}</span>
              <input
                type="number"
                inputMode="numeric"
                min={1}
                max={item.quantity}
                value={howMany}
                aria-label={t('How many of {item}', { item: item.name })}
                onChange={(event) => {
                  const value = Number.parseInt(event.target.value, 10);
                  setAmount(Number.isNaN(value) ? 1 : Math.max(1, Math.min(item.quantity, value)));
                }}
              />
              <span className="muted">{t('of {total}', { total: item.quantity })}</span>
            </label>
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
    </article>
  );
}
