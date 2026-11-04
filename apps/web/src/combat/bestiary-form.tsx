import {
  SIDES,
  type AddedFromBestiaryResponse,
  type BestiaryResponse,
  type CommandRejected,
  type EncounterView,
  type Side,
} from '@ltw/contracts';
import { useLanguage, useT, type Translate } from '@ltw/ui';
import { useCallback, useId, useState, type SubmitEvent } from 'react';

import type { WorldApi } from '../api/client.ts';
import { useResource } from '../api/resource.ts';
import { rejectionMessage } from '../exploration/outcome-messages.ts';
import { Field } from '../session/account-forms.tsx';
import { Glyph } from '../visual/glyph.tsx';
import { creatureTypeArtUrl } from '../visual/ui-kit.ts';
import { BestiaryEntry } from './bestiary-entry.tsx';
import { SquareFields, useSquare } from './join-forms.tsx';

/**
 * A creature from the SRD's bestiary into the running fight (docs/adr/0053-monsters-as-data.md
 * §3): the DM finds a stat block by name or type, names its side and square, and the server adds
 * a new creature with that stat block to the campaign and to the fight. At most forty matches show
 * at once; the words narrow them. A square it cannot take is refused before anything is added.
 */
const SHOWN = 40;

/** The server's reasons a creature cannot take its square (`details.square`), in the DM's words. */
const SQUARE_REFUSALS: Readonly<Record<string, string>> = {
  taken: 'Someone already stands there. Choose another square.',
  outside: 'It does not fit there: its space would cross the edge of the battlefield or a wall.',
  full: 'The fight holds as many combatants as it can.',
};

const refusalText = (t: Translate, refused: CommandRejected) => {
  const square = refused.details?.['square'];
  const words = typeof square === 'string' ? SQUARE_REFUSALS[square] : undefined;
  return words === undefined
    ? rejectionMessage(t, refused.code, refused.message, 'AddCombatant')
    : t(words);
};

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
  const number = new Intl.NumberFormat(useLanguage());
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
      const added = await api.post<AddedFromBestiaryResponse | CommandRejected>(
        `bestiary/${encodeURIComponent(pick)}/add`,
        { requestId: crypto.randomUUID(), square: at.square, side },
        AbortSignal.timeout(20_000),
      );
      const name = matches.find((entry) => entry.monsterId === pick)?.name ?? pick;
      setNote(
        added.status === 'rejected'
          ? refusalText(t, added)
          : added.fighting
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
      {picked && <BestiaryEntry key={picked.monsterId} api={api} monsterId={picked.monsterId} />}
      {picked && (
        <p className="fine-print bestiary-stats">
          <CreatureTypePicture creatureType={picked.creatureType} />
          {t('{size} {type} · AC {ac} · {hp} HP · {xp} XP', {
            size: t(picked.size),
            type: t(picked.type),
            ac: picked.armorClass,
            hp: picked.hitPoints,
            xp: number.format(picked.xp),
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

/** The creature type's picture beside a stat block's line (docs/adr/0055-…md §6). */
function CreatureTypePicture({ creatureType }: { readonly creatureType: string | null }) {
  const url = creatureTypeArtUrl(creatureType);
  return url ? <img className="bestiary-type-art" src={url} alt="" /> : null;
}
