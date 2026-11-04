import {
  ITEM_CATEGORIES,
  type CommandRejected,
  type GivenCatalogItemResponse,
  type ItemCatalogListing,
  type ItemCatalogResponse,
  type ItemCategory,
} from '@ltw/contracts';
import { useLanguage, useT } from '@ltw/ui';
import { useCallback, useId, useState, type SubmitEvent } from 'react';

import type { WorldApi } from '../api/client.ts';
import { useResource } from '../api/resource.ts';
import { useDiceTable } from '../dice/table.tsx';
import { rejectionMessage } from '../exploration/outcome-messages.ts';
import { Field } from '../session/account-forms.tsx';
import { Glyph } from '../visual/glyph.tsx';
import { worthWords } from './inventory/purse.tsx';
import { categoryName, rarityName, roundWeight } from './item-text.ts';

/**
 * The DM gives an item from the campaign's catalog (docs/adr/0054-items-as-data.md §4): Ravenford's
 * own entries and the SRD's, found by name and category; the server makes the item and grants it
 * to the character whose pack is open, in a quantity when it stacks. Read only when opened.
 */
const SHOWN = 40;

export function GiveItemForm({
  api,
  holderId,
  locked,
}: {
  readonly api: WorldApi;
  readonly holderId: string;
  readonly locked: boolean;
}) {
  const t = useT();
  const isDm = useDiceTable()?.isDm ?? false;
  const [open, setOpen] = useState(false);
  if (!isDm) return null;
  return (
    <details
      className="give-item"
      onToggle={(event) => {
        setOpen(event.currentTarget.open);
      }}
    >
      <summary>{t('Give an item from the catalog')}</summary>
      {open && <GiveItemFields api={api} holderId={holderId} locked={locked} />}
    </details>
  );
}

function GiveItemFields({
  api,
  holderId,
  locked,
}: {
  readonly api: WorldApi;
  readonly holderId: string;
  readonly locked: boolean;
}) {
  const t = useT();
  const language = useLanguage();
  const ids = useId();
  const load = useCallback(
    (signal: AbortSignal) => api.get<ItemCatalogResponse>('items/catalog', signal, false),
    [api],
  );
  const catalog = useResource('items-catalog', load);
  const [words, setWords] = useState('');
  const [category, setCategory] = useState<ItemCategory | 'all'>('all');
  const [chosen, setChosen] = useState('');
  const [made, setMade] = useState('');
  const [count, setCount] = useState('1');
  const [unknown, setUnknown] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  if (catalog.resource.status !== 'ready') return null;
  const nameOf = (entry: ItemCatalogListing) => entry.name[language === 'ru' ? 'ru' : 'en'];
  const query = words.trim().toLowerCase();
  const matches = catalog.resource.value.items
    .filter(
      (entry) =>
        (category === 'all' || entry.category === category) &&
        (query === '' ||
          entry.name.en.toLowerCase().includes(query) ||
          entry.name.ru.toLowerCase().includes(query)),
    )
    .slice(0, SHOWN);
  const picked = matches.find((entry) => entry.itemId === chosen) ?? matches[0];
  // A magic weapon, armor or shield is made on a base the DM names (ADR 0054 §5).
  const all = catalog.resource.value.items;
  const bases = (picked?.base?.allowed ?? []).flatMap((id) =>
    all.filter((entry) => entry.itemId === id),
  );
  const base = bases.find((entry) => entry.itemId === made) ?? bases[0];
  const quantity = picked?.stackable ? Number.parseInt(count, 10) : 1;
  const quantityError =
    Number.isInteger(quantity) && quantity >= 1 && quantity <= 99
      ? null
      : t('A whole number from 1 to 99.');
  const give = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!picked || quantityError) return;
    setBusy(true);
    try {
      const given = await api.post<GivenCatalogItemResponse | CommandRejected>(
        `items/catalog/${encodeURIComponent(picked.itemId)}/give`,
        {
          requestId: crypto.randomUUID(),
          holderId,
          quantity,
          ...(base ? { baseCatalogId: base.itemId } : {}),
          ...(unknown && picked.rarity !== null ? { unidentified: true } : {}),
        },
        AbortSignal.timeout(20_000),
      );
      setNote(
        given.status === 'rejected'
          ? rejectionMessage(t, given.code, given.message, 'GrantItem')
          : t('{item} is in the pack.', { item: given.name }),
      );
    } catch {
      setNote(t('It could not be given. Try again.'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <form
      className="hand-form give-item-form"
      noValidate
      onSubmit={(event) => void give(event)}
      aria-labelledby={`${ids}-title`}
    >
      <h4 id={`${ids}-title`} className="visually-hidden">
        {t('Give an item from the catalog')}
      </h4>
      <div className="hand-row">
        <Field label={t('Find by name')}>
          {(control) => (
            <input
              {...control}
              type="search"
              value={words}
              onChange={(event) => {
                setWords(event.target.value);
              }}
            />
          )}
        </Field>
        <Field label={t('Kind')}>
          {(control) => (
            <select
              {...control}
              value={category}
              onChange={(event) => {
                setCategory(event.target.value as ItemCategory | 'all');
              }}
            >
              <option value="all">{t('Any kind')}</option>
              {ITEM_CATEGORIES.map((option) => (
                <option key={option} value={option}>
                  {categoryName(t, option)}
                </option>
              ))}
            </select>
          )}
        </Field>
      </div>
      <Field label={t('Item')} error={matches.length === 0 ? t('Nothing matches.') : null}>
        {(control) => (
          <select
            {...control}
            value={picked?.itemId ?? ''}
            onChange={(event) => {
              setChosen(event.target.value);
            }}
          >
            {matches.map((entry) => (
              <option key={entry.itemId} value={entry.itemId}>
                {entry.source === 'srd'
                  ? t('{name} (SRD)', { name: nameOf(entry) })
                  : nameOf(entry)}
              </option>
            ))}
          </select>
        )}
      </Field>
      {bases.length > 1 && (
        <Field label={t('Made on')}>
          {(control) => (
            <select
              {...control}
              value={base?.itemId ?? ''}
              onChange={(event) => {
                setMade(event.target.value);
              }}
            >
              {bases.map((entry) => (
                <option key={entry.itemId} value={entry.itemId}>
                  {nameOf(entry)}
                </option>
              ))}
            </select>
          )}
        </Field>
      )}
      {picked && (
        <p className="fine-print">
          {[
            categoryName(t, picked.category),
            picked.rarity ? rarityName(t, picked.rarity) : null,
            picked.attunement === null ? null : t('Needs attunement'),
            worthWords(t, picked.valueCp + (base?.valueCp ?? 0)),
            t('{weight} lb', { weight: roundWeight(base?.weightLb ?? picked.weightLb) }),
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
      )}
      {picked?.rarity && (
        <label className="give-item-unknown">
          <input
            type="checkbox"
            checked={unknown}
            onChange={(event) => {
              setUnknown(event.target.checked);
            }}
          />
          {t('Unidentified: they see what it looks like until they learn what it is')}
        </label>
      )}
      <div className="action-row give-item-actions">
        {picked?.stackable && (
          <Field label={t('How many')} error={quantityError}>
            {(control) => (
              <input
                {...control}
                type="number"
                inputMode="numeric"
                min={1}
                max={99}
                value={count}
                onChange={(event) => {
                  setCount(event.target.value);
                }}
              />
            )}
          </Field>
        )}
        <button
          type="submit"
          className="primary-button"
          disabled={locked || busy || !picked || quantityError !== null}
        >
          <Glyph name="use-item" />
          {t('Give it')}
        </button>
      </div>
      {note && (
        <p className="fine-print" role="status">
          {note}
        </p>
      )}
    </form>
  );
}
