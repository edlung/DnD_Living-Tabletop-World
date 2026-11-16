import {
  AMBIENCE_CHOICES,
  type AmbienceChoice,
  type PlaceSound,
  type PlaceSoundsResponse,
  type TrackListResponse,
} from '@ltw/contracts';
import { useT } from '@ltw/ui';
import { useCallback, useEffect, useId, useState } from 'react';

import type { WorldApi } from '../api/client.ts';
import { useResource } from '../api/resource.ts';
import { AMBIENCE_WORDS } from './sound-choice.tsx';

const KEEP = '';

/**
 * A place's own sound, kept where the DM shows the place (docs/adr/0073-table-ideas.md §6): an
 * ambience and one of the DM's tracks that "Show on the screens" switches on with the place. The
 * DM's alone to set and to read. "Leave as it is" for both takes the place's sound away. What
 * plays stays the table's one sound, which Session still shows and changes.
 */
export function PlaceSoundField({
  api,
  locationId,
  placeName,
}: {
  readonly api: WorldApi;
  readonly locationId: string;
  readonly placeName: string;
}) {
  const t = useT();
  const ids = useId();
  const loadSounds = useCallback(
    (signal: AbortSignal) => api.get<PlaceSoundsResponse>('dm/place-sounds', signal, false),
    [api],
  );
  const loadTracks = useCallback(
    (signal: AbortSignal) => api.get<TrackListResponse>('music', signal, false).catch(() => null),
    [api],
  );
  const sounds = useResource('place-sounds', loadSounds);
  const tracks = useResource('place-sound-tracks', loadTracks);
  const stored: PlaceSound | null =
    sounds.resource.status === 'ready'
      ? (sounds.resource.value.sounds.find((sound) => sound.locationId === locationId) ?? null)
      : null;
  const list = tracks.resource.status === 'ready' ? (tracks.resource.value?.tracks ?? []) : [];
  const [ambience, setAmbience] = useState<string>(KEEP);
  const [trackId, setTrackId] = useState<string>(KEEP);
  const [state, setState] = useState<'idle' | 'busy' | 'saved' | 'failed'>('idle');
  // Another place chosen, or its sound read: the fields show what is kept for it.
  const kept = `${locationId}|${stored?.ambience ?? KEEP}|${stored?.trackId ?? KEEP}`;
  useEffect(() => {
    setAmbience(stored?.ambience ?? KEEP);
    setTrackId(stored?.trackId ?? KEEP);
    setState('idle');
    // `kept` stands for the stored values: the effect follows them, not the object read anew.
  }, [kept]);
  // A track deleted since: the place no longer brings it, and the field says so by its absence.
  const known = trackId === KEEP || list.some((track) => track.trackId === trackId);
  const changed =
    ambience !== (stored?.ambience ?? KEEP) || (known ? trackId : KEEP) !== (stored?.trackId ?? KEEP);
  const save = () => {
    if (state === 'busy' || !changed) return;
    setState('busy');
    void api
      .post(
        `dm/place-sounds/${encodeURIComponent(locationId)}`,
        {
          ambience: ambience === KEEP ? null : (ambience as AmbienceChoice),
          trackId: trackId === KEEP || !known ? null : trackId,
        },
        AbortSignal.timeout(20_000),
      )
      .then(
        () => {
          setState('saved');
          sounds.reread();
        },
        () => {
          setState('failed');
        },
      );
  };
  if (sounds.resource.status !== 'ready') return null;
  return (
    <fieldset className="place-sound">
      <legend>{t('The sound of {place}', { place: placeName })}</legend>
      <p className="field-hint" id={`${ids}-hint`}>
        {t('Showing this place on the screens switches its sound on. You can still change the sound in Session.')}
      </p>
      <div className="screen-cast-row">
        <div className="field">
          <label htmlFor={`${ids}-ambience`}>{t('Ambience')}</label>
          <select
            id={`${ids}-ambience`}
            value={ambience}
            aria-describedby={`${ids}-hint`}
            onChange={(event) => {
              setAmbience(event.target.value);
              setState('idle');
            }}
          >
            <option value={KEEP}>{t('Leave as it is')}</option>
            {AMBIENCE_CHOICES.map((choice) => (
              <option key={choice} value={choice}>
                {t(AMBIENCE_WORDS[choice])}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor={`${ids}-track`}>{t('Music')}</label>
          <select
            id={`${ids}-track`}
            value={known ? trackId : KEEP}
            onChange={(event) => {
              setTrackId(event.target.value);
              setState('idle');
            }}
          >
            <option value={KEEP}>{t('Leave as it is')}</option>
            {list.map((track) => (
              <option key={track.trackId} value={track.trackId}>
                {track.title}
              </option>
            ))}
          </select>
          {list.length === 0 && (
            <p className="field-hint">{t('Add music in Session to choose a track here.')}</p>
          )}
        </div>
      </div>
      <div className="action-row">
        <button type="button" aria-disabled={state === 'busy' || !changed} onClick={save}>
          {t('Keep this sound for the place')}
        </button>
        <p role="status" className="place-sound-status">
          {state === 'saved' ? t('Kept.') : ''}
        </p>
      </div>
      {state === 'failed' && (
        <p role="alert" className="authoring-notice error">
          {t('That was not kept. Try again.')}
        </p>
      )}
    </fieldset>
  );
}
