import {
  SIDES,
  type AddedFromBestiaryResponse,
  type BestiaryResponse,
  type EncounterView,
  type Side,
} from '@ltw/contracts';
import { useT } from '@ltw/ui';
import { useCallback, useId, useState, type SubmitEvent } from 'react';

import type { WorldApi } from '../api/client.ts';
import { useResource } from '../api/resource.ts';
import { Field } from '../session/account-forms.tsx';
import { Glyph } from '../visual/glyph.tsx';
import { SquareFields, useSquare } from './join-forms.tsx';

/**
 * A creature from the SRD's bestiary into the running fight (docs/adr/0053-monsters-as-data.md
 * §3): the DM finds a stat block by name or type, names its side and square, and the server adds
 * a new creature with that stat block to the campaign and to the fight. At most forty matches show
 * at once; the words narrow them.
 */
const SHOWN = 40;

export function BestiaryForm({
  api,
  encounter,
  locked,
}: {
  readonly api: WorldApi;
  readonly encounter: EncounterView;
  readonly locked: boolean;
}) {
  const t = useT();
  const ids = useId();
  const load = useCallback(
    (signal: AbortSignal) => api.get<BestiaryResponse>('bestiary', signal, false),
    [api],
  );
  const bestiary = useResource('bestiary', load);
  const at = useSquare(t, encounter);
  const [words, setWords] = useState('');
  const [chosen, setChosen] = useState('');
  const [side, setSide] = useState<Side>('hostile');
  const [attempted, setAttempted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  if (bestiary.resource.status !== 'ready') return null;
  const query = words.trim().toLowerCase();
  const matches = bestiary.resource.value.monsters
    .filter(
      (entry) =>
        query === '' ||
        entry.name.toLowerCase().includes(query) ||
        entry.type.toLowerCase().includes(query),
    )
    .slice(0, SHOWN);
  const pick = matches.some((entry) => entry.monsterId === chosen)
    ? chosen
    : (matches[0]?.monsterId ?? '');
  const picked = matches.find((entry) => entry.monsterId === pick);
  const add = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAttempted(true);
    if (at.error || pick === '') return;
    setBusy(true);
    try {
      const added = await api.post<AddedFromBestiaryResponse>(
        `bestiary/${encodeURIComponent(pick)}/add`,
        { requestId: crypto.randomUUID(), square: at.square, side },
        AbortSignal.timeout(20_000),
      );
      const name = matches.find((entry) => entry.monsterId === pick)?.name ?? pick;
      setNote(
        added.fighting
          ? t('{name} joins the fight.', { name: t(name) })
          : t('{name} was added to the campaign.', { name: t(name) }),
      );
    } catch {
      setNote(t('It could not be added. Try again.'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <form
      className="hand-form join-fight bestiary-form"
      noValidate
      onSubmit={(event) => void add(event)}
      aria-labelledby={`${ids}-title`}
    >
      <h5 id={`${ids}-title`}>{t('From the bestiary')}</h5>
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
      <Field label={t('Creature')} error={attempted && pick === '' ? t('Nothing matches.') : null}>
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
                {t('{name} · CR {cr}', { name: t(entry.name), cr: entry.challenge })}
              </option>
            ))}
          </select>
        )}
      </Field>
      {picked && (
        <p className="fine-print bestiary-stats">
          {t('{size} {type} · AC {ac} · {hp} HP · {xp} XP', {
            size: t(picked.size),
            type: t(picked.type),
            ac: picked.armorClass,
            hp: picked.hitPoints,
            xp: picked.xp,
          })}
        </p>
      )}
      <div className="hand-row">
        <Field label={t('Side')}>
          {(control) => (
            <select
              {...control}
              value={side}
              onChange={(event) => {
                setSide(event.target.value as Side);
              }}
            >
              {SIDES.map((option) => (
                <option key={option} value={option}>
                  {t(option)}
                </option>
              ))}
            </select>
          )}
        </Field>
        <SquareFields at={at} attempted={attempted} />
      </div>
      <div className="action-row">
        <button type="submit" className="primary-button" disabled={locked || busy}>
          <Glyph name="melee" />
          {t('Add to the fight')}
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
