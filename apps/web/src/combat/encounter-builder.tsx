import type {
  BestiaryResponse,
  EncounterDifficultyResponse,
  EntityRef,
  SavedEncounterRequest,
  SavedEncounterView,
  SavedFoe,
} from '@ltw/contracts';
import { useLanguage, useT } from '@ltw/ui';
import { useCallback, useEffect, useId, useState, type SubmitEvent } from 'react';

import type { WorldApi } from '../api/client.ts';
import { useResource } from '../api/resource.ts';
import { Field } from '../session/account-forms.tsx';
import { Glyph } from '../visual/glyph.tsx';
import { DifficultyWords } from './difficulty-words.tsx';
import { foeSquares, partyStartSquares, type CreatureSize } from './encounter-layout.ts';

/**
 * The DM's encounter builder (docs/adr/0057-encounters-maps-loot.md §1): a name, a place, the
 * field's size, and foes from the bestiary or the campaign's own creatures, each with how many;
 * the fight's difficulty for the party at the place is read again as the foes change. Saving lays
 * the foes out from the right edge and the party along the left; the World Engine starts it.
 */
/** A foe without its square: a bestiary entry or one of the campaign's creatures. */
type FoeRef =
  | { readonly kind: 'bestiary'; readonly monsterId: string }
  | { readonly kind: 'creature'; readonly entityId: string };

interface Pick {
  readonly key: string;
  readonly foe: FoeRef;
  readonly name: string;
  readonly size: CreatureSize;
  readonly count: number;
}

const SHOWN = 30;
const SIZES = [8, 10, 12, 16, 20, 24, 30, 40] as const;

const keyOf = (foe: FoeRef) =>
  foe.kind === 'bestiary' ? `b:${foe.monsterId}` : `c:${foe.entityId}`;

/** The picks a saved encounter holds, its foes gathered by kind. */
function picksOf(encounter: SavedEncounterView | null): Pick[] {
  const picks = new Map<string, Pick>();
  for (const view of encounter?.foes ?? []) {
    const foe =
      view.foe.kind === 'bestiary'
        ? { kind: 'bestiary' as const, monsterId: view.foe.monsterId }
        : { kind: 'creature' as const, entityId: view.foe.entityId };
    const key = keyOf(foe);
    const known = picks.get(key);
    picks.set(key, {
      key,
      foe,
      name: view.name,
      size: view.size,
      count: (known?.count ?? 0) + 1,
    });
  }
  return [...picks.values()];
}

/** The foes one by one, each on its square; null when they do not fit on the field. */
function placed(picks: readonly Pick[], field: { width: number; height: number }) {
  const each = picks.flatMap((pick) => Array.from({ length: pick.count }, () => pick));
  const squares = foeSquares(
    each.map((pick) => pick.size),
    field,
  );
  if (!squares) return null;
  return each.map((pick, index): SavedFoe => ({
    ...pick.foe,
    position: squares[index] ?? { x: 0, y: 0 },
  }));
}

export function EncounterBuilder({
  api,
  encounter,
  locationId,
  places,
  creatures,
  onSaved,
  onCancel,
}: {
  readonly api: WorldApi;
  /** The encounter to change; null for a new one. */
  readonly encounter: SavedEncounterView | null;
  readonly locationId: string;
  readonly places: readonly EntityRef[];
  /** The campaign's own creatures the DM may bring. */
  readonly creatures: readonly EntityRef[];
  readonly onSaved: () => void;
  readonly onCancel: () => void;
}) {
  const t = useT();
  const ids = useId();
  const number = new Intl.NumberFormat(useLanguage());
  const loadBestiary = useCallback(
    (signal: AbortSignal) => api.get<BestiaryResponse>('bestiary', signal, false),
    [api],
  );
  const bestiary = useResource('bestiary', loadBestiary);
  // One id for the builder's life: a save retried after a lost answer changes the same encounter.
  const [encounterId] = useState(() => encounter?.encounterId ?? crypto.randomUUID());
  const [name, setName] = useState(encounter?.name ?? '');
  const [place, setPlace] = useState(encounter?.location?.entityId ?? locationId);
  const [width, setWidth] = useState(encounter?.battlefield.width ?? 16);
  const [height, setHeight] = useState(encounter?.battlefield.height ?? 12);
  const [picks, setPicks] = useState<Pick[]>(() => picksOf(encounter));
  const [words, setWords] = useState('');
  const [chosen, setChosen] = useState('');
  const [attempted, setAttempted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [difficulty, setDifficulty] = useState<EncounterDifficultyResponse | null>(null);
  const field = { width, height };
  const foes = placed(picks, field);
  const foesKey = picks.map((pick) => `${pick.key}x${String(pick.count)}`).join('|');
  // The difficulty for the party at the place, read again as the foes change.
  useEffect(() => {
    const controller = new AbortController();
    const preview = picks.flatMap((pick) =>
      Array.from({ length: pick.count }, (): SavedFoe => ({
        ...pick.foe,
        position: { x: 0, y: 0 },
      })),
    );
    api
      .post<EncounterDifficultyResponse>(
        'encounters/difficulty',
        { locationId: place, foes: preview },
        controller.signal,
      )
      .then(setDifficulty)
      .catch(() => {
        setDifficulty(null);
      });
    return () => {
      controller.abort();
    };
  }, [api, place, foesKey]);

  const add = (pick: Omit<Pick, 'count'>) => {
    setPicks((current) => {
      const known = current.find((one) => one.key === pick.key);
      return known
        ? current.map((one) => (one.key === pick.key ? { ...one, count: one.count + 1 } : one))
        : [...current, { ...pick, count: 1 }];
    });
  };
  const change = (key: string, by: number) => {
    setPicks((current) =>
      current
        .map((one) => (one.key === key ? { ...one, count: one.count + by } : one))
        .filter((one) => one.count > 0),
    );
  };
  const query = words.trim().toLowerCase();
  const matches =
    bestiary.resource.status === 'ready'
      ? bestiary.resource.value.monsters
          .filter(
            (entry) =>
              query === '' ||
              entry.name.toLowerCase().includes(query) ||
              entry.type.toLowerCase().includes(query),
          )
          .slice(0, SHOWN)
      : [];
  const pick = matches.some((entry) => entry.monsterId === chosen)
    ? chosen
    : (matches[0]?.monsterId ?? '');
  const nameError = attempted && name.trim() === '' ? t('Name the encounter.') : null;
  const save = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAttempted(true);
    if (name.trim() === '' || !foes || foes.length === 0) return;
    const body: SavedEncounterRequest = {
      name: name.trim(),
      locationId: place,
      battlefield: { width, height, difficult: [], cover: [] },
      foes,
      partyStart: partyStartSquares(Math.max(1, difficulty?.party.length ?? 4), field),
    };
    setBusy(true);
    setNote(null);
    try {
      await api.post(
        `encounters/saved/${encodeURIComponent(encounterId)}`,
        body,
        AbortSignal.timeout(20_000),
      );
      onSaved();
    } catch {
      setNote(t('The encounter could not be saved. Try again.'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <form
      className="encounter-builder"
      noValidate
      aria-labelledby={`${ids}-title`}
      onSubmit={(event) => void save(event)}
    >
      <h5 id={`${ids}-title`}>{encounter ? t('Change the encounter') : t('Build an encounter')}</h5>
      <div className="builder-fields">
        <Field label={t('Encounter name')} error={nameError}>
          {(control) => (
            <input
              {...control}
              value={name}
              maxLength={80}
              onChange={(event) => {
                setName(event.target.value);
              }}
            />
          )}
        </Field>
        <Field label={t('Place')}>
          {(control) => (
            <select
              {...control}
              value={place}
              onChange={(event) => {
                setPlace(event.target.value);
              }}
            >
              {places.map((one) => (
                <option key={one.entityId} value={one.entityId}>
                  {one.name}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label={t('Field width')}>
          {(control) => (
            <select
              {...control}
              value={width}
              onChange={(event) => {
                setWidth(Number(event.target.value));
              }}
            >
              {SIZES.map((size) => (
                <option key={size} value={size}>
                  {t('{count} squares', { count: size })}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label={t('Field depth')}>
          {(control) => (
            <select
              {...control}
              value={height}
              onChange={(event) => {
                setHeight(Number(event.target.value));
              }}
            >
              {SIZES.map((size) => (
                <option key={size} value={size}>
                  {t('{count} squares', { count: size })}
                </option>
              ))}
            </select>
          )}
        </Field>
      </div>
      <fieldset className="builder-foes">
        <legend>{t('Foes')}</legend>
        <div className="builder-fields builder-find">
          <Field label={t('Find by name or type')}>
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
          <Field label={t('From the bestiary')}>
            {(control) => (
              <select
                {...control}
                value={pick}
                onChange={(event) => {
                  setChosen(event.target.value);
                }}
              >
                {matches.map((entry) => (
                  <option key={entry.monsterId} value={entry.monsterId}>
                    {t('{name} (CR {rating}, {xp} XP)', {
                      name: entry.name,
                      rating: entry.challenge,
                      xp: number.format(entry.xp),
                    })}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <button
            type="button"
            disabled={pick === ''}
            onClick={() => {
              const entry = matches.find((one) => one.monsterId === pick);
              if (!entry) return;
              add({
                key: `b:${entry.monsterId}`,
                foe: { kind: 'bestiary', monsterId: entry.monsterId },
                name: entry.name,
                size: entry.size.toLowerCase() as CreatureSize,
              });
            }}
          >
            {t('Add')}
          </button>
        </div>
        {creatures.length > 0 && (
          <div className="builder-fields">
            <Field label={t('From the campaign')}>
              {(control) => (
                <select
                  {...control}
                  defaultValue=""
                  onChange={(event) => {
                    const creature = creatures.find((one) => one.entityId === event.target.value);
                    event.target.value = '';
                    if (!creature) return;
                    add({
                      key: `c:${creature.entityId}`,
                      foe: { kind: 'creature', entityId: creature.entityId },
                      name: creature.name,
                      size: 'medium',
                    });
                  }}
                >
                  <option value="">{t('Choose a creature')}</option>
                  {creatures.map((one) => (
                    <option key={one.entityId} value={one.entityId}>
                      {one.name}
                    </option>
                  ))}
                </select>
              )}
            </Field>
          </div>
        )}
        {picks.length === 0 ? (
          <p className="muted">{t('No foes yet: find one and add it.')}</p>
        ) : (
          <ul className="builder-picks">
            {picks.map((one) => (
              <li key={one.key}>
                <span className="builder-pick-name">{one.name}</span>
                <span className="builder-pick-count">{t('× {count}', { count: one.count })}</span>
                <button
                  type="button"
                  aria-label={t('One fewer {name}', { name: one.name })}
                  onClick={() => {
                    change(one.key, -1);
                  }}
                >
                  −
                </button>
                <button
                  type="button"
                  aria-label={t('One more {name}', { name: one.name })}
                  disabled={one.foe.kind === 'creature'}
                  onClick={() => {
                    change(one.key, 1);
                  }}
                >
                  +
                </button>
              </li>
            ))}
          </ul>
        )}
        {attempted && picks.length === 0 && (
          <p className="field-error" role="alert">
            {t('Add at least one foe.')}
          </p>
        )}
        {picks.length > 0 && !foes && (
          <p className="field-error" role="alert">
            {t('So many foes need a larger field.')}
          </p>
        )}
      </fieldset>
      <DifficultyWords preview={difficulty} />
      {note && (
        <p className="authoring-notice error" role="alert">
          {note}
        </p>
      )}
      <div className="action-row">
        <button type="submit" className="primary-button" disabled={busy}>
          <Glyph name="encounter" />
          {busy ? t('Saving…') : t('Save the encounter')}
        </button>
        <button type="button" onClick={onCancel}>
          {t('Cancel')}
        </button>
      </div>
    </form>
  );
}
