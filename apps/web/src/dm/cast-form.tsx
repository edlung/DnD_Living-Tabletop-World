import type { Cast, CastKind, CastResponse, EncounterResponse, EntityRef } from '@ltw/contracts';
import { useT } from '@ltw/ui';
import { useCallback, useId, useState, type SubmitEvent } from 'react';

import type { WorldApi } from '../api/client.ts';
import { useResource } from '../api/resource.ts';
import { Glyph } from '../visual/glyph.tsx';

/**
 * What the table's screens show (docs/adr/0042-table-display.md §3), on the DM's Table screen
 * sheet: a place's scene (or wherever the party is), the battlefield (its zoom, and whom a zoomed
 * board keeps in view), the table's rolls, a title card, the Chronicle, a picture, the join QR
 * code, or nothing. The screens read only what the party knows.
 */
const KINDS: readonly CastKind[] = [
  'scene',
  'battlefield',
  'dice',
  'title',
  'chronicle',
  'picture',
  'join',
  'blank',
];

const KIND_WORDS: Readonly<Record<CastKind, string>> = {
  scene: 'A place’s scene',
  battlefield: 'The battlefield',
  dice: 'The table’s rolls',
  title: 'A title card',
  chronicle: 'The Chronicle’s newest chapter',
  picture: 'A picture',
  join: 'The QR code to join, with “last time”',
  blank: 'Nothing (a dark screen)',
};

const PARTY_PLACE = '';

export function CastForm({
  api,
  current,
  directory,
  onCast,
}: {
  readonly api: WorldApi;
  readonly current: Cast;
  readonly directory: readonly EntityRef[];
  readonly onCast: () => void;
}) {
  const t = useT();
  const id = useId();
  const [kind, setKind] = useState<CastKind>(current.kind);
  const [place, setPlace] = useState(
    current.kind === 'scene' ? (current.locationId ?? PARTY_PLACE) : PARTY_PLACE,
  );
  const [zoom, setZoom] = useState(current.kind === 'battlefield' ? current.zoom : 1);
  const [focus, setFocus] = useState(current.kind === 'battlefield' ? (current.focus ?? '') : '');
  const [title, setTitle] = useState(current.kind === 'title' ? current.title : '');
  const [subtitle, setSubtitle] = useState(current.kind === 'title' ? current.subtitle : '');
  const [entityId, setEntityId] = useState(current.kind === 'picture' ? current.entityId : '');
  const [note, setNote] = useState<string | null>(null);
  const places = directory.filter((entity) => entity.kind === 'location');
  // Whom a zoomed board keeps in view: the fight's combatants, as the DM sees them.
  const loadFight = useCallback(
    (signal: AbortSignal) => api.get<EncounterResponse>('encounter', signal),
    [api],
  );
  const fight = useResource('screen-encounter', loadFight);
  const fighters =
    fight.resource.status === 'ready' ? (fight.resource.value.encounter?.combatants ?? []) : [];
  const pictures = directory.filter((entity) => entity.kind !== 'faction');
  const build = (): Cast | null => {
    switch (kind) {
      case 'scene':
        return { kind, locationId: place === PARTY_PLACE ? null : place };
      case 'battlefield':
        return { kind, zoom, focus: focus === '' ? null : focus };
      case 'title':
        return title.trim() === ''
          ? null
          : { kind, title: title.trim(), subtitle: subtitle.trim() };
      case 'picture':
        return entityId === '' ? null : { kind, entityId };
      default:
        return { kind };
    }
  };
  async function show(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const cast = build();
    if (cast === null) {
      setNote(kind === 'title' ? t('Write the title first.') : t('Choose the picture first.'));
      return;
    }
    try {
      await api.post<CastResponse>('display/cast', { cast }, AbortSignal.timeout(20_000));
      setNote(null);
      onCast();
    } catch {
      setNote(t('The screens could not be told. Try again.'));
    }
  }
  return (
    <section className="tool-group screen-cast" aria-labelledby={`${id}-title`}>
      <h3 id={`${id}-title`}>
        <Glyph name="look" />
        {t('What the screens show')}
      </h3>
      <p className="muted">{t('Now: {what}', { what: t(KIND_WORDS[current.kind]) })}</p>
      <form className="screen-cast-form" noValidate onSubmit={(event) => void show(event)}>
        <fieldset className="join-modes">
          <legend>{t('Show')}</legend>
          {KINDS.map((option) => (
            <div className="join-mode" key={option}>
              <input
                type="radio"
                id={`${id}-kind-${option}`}
                name={`${id}-kind`}
                checked={kind === option}
                onChange={() => {
                  setKind(option);
                }}
              />
              <label htmlFor={`${id}-kind-${option}`}>{t(KIND_WORDS[option])}</label>
            </div>
          ))}
        </fieldset>
        {kind === 'scene' && (
          <div className="field">
            <label htmlFor={`${id}-place`}>{t('Place')}</label>
            <select
              id={`${id}-place`}
              value={place}
              onChange={(event) => {
                setPlace(event.target.value);
              }}
            >
              <option value={PARTY_PLACE}>{t('Where the party is')}</option>
              {places.map((entity) => (
                <option key={entity.entityId} value={entity.entityId}>
                  {entity.name}
                </option>
              ))}
            </select>
          </div>
        )}
        {kind === 'battlefield' && (
          <div className="screen-cast-row">
            <div className="field">
              <label htmlFor={`${id}-zoom`}>{t('Zoom')}</label>
              <select
                id={`${id}-zoom`}
                value={zoom}
                onChange={(event) => {
                  setZoom(Number(event.target.value));
                }}
              >
                {[0.75, 1, 1.5, 2].map((value) => (
                  <option key={value} value={value}>
                    {`${String(value)}×`}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor={`${id}-focus`}>{t('Keep in view')}</label>
              <select
                id={`${id}-focus`}
                value={focus}
                onChange={(event) => {
                  setFocus(event.target.value);
                }}
              >
                <option value="">{t('Whoever acts')}</option>
                {fighters.map((fighter) => (
                  <option key={fighter.entity.entityId} value={fighter.entity.entityId}>
                    {fighter.entity.name ?? fighter.entity.entityId}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
        {kind === 'title' && (
          <>
            <div className="field">
              <label htmlFor={`${id}-heading`}>{t('Title')}</label>
              <input
                id={`${id}-heading`}
                value={title}
                maxLength={80}
                onChange={(event) => {
                  setTitle(event.target.value);
                }}
              />
            </div>
            <div className="field">
              <label htmlFor={`${id}-sub`}>{t('Below it (optional)')}</label>
              <input
                id={`${id}-sub`}
                value={subtitle}
                maxLength={160}
                onChange={(event) => {
                  setSubtitle(event.target.value);
                }}
              />
            </div>
          </>
        )}
        {kind === 'picture' && (
          <div className="field">
            <label htmlFor={`${id}-entity`}>{t('Whose picture')}</label>
            <select
              id={`${id}-entity`}
              value={entityId}
              onChange={(event) => {
                setEntityId(event.target.value);
              }}
            >
              <option value="">{t('Choose…')}</option>
              {pictures.map((entity) => (
                <option key={entity.entityId} value={entity.entityId}>
                  {entity.name}
                </option>
              ))}
            </select>
            <p className="field-hint">
              {t('A screen shows only an approved picture the party knows.')}
            </p>
          </div>
        )}
        {kind === 'join' && (
          <p className="field-hint">
            {t('Open the table link on the Players sheet: its QR code shows here.')}
          </p>
        )}
        {note && (
          <p role="alert" className="authoring-notice error">
            {note}
          </p>
        )}
        <button className="primary-button" type="submit">
          <Glyph name="live" />
          {t('Show on the screens')}
        </button>
      </form>
    </section>
  );
}
