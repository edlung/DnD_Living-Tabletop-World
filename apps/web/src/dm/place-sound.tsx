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
  // The DM's tracks, once read: until then a kept track is taken to be there still.
  const tracksRead = tracks.resource.status === 'ready' && tracks.resource.value !== null;
  const list = tracks.resource.status === 'ready' ? (tracks.resource.value?.tracks ?? []) : [];
  const [ambience, setAmbience] = useState<string>(KEEP);
  const [trackId, setTrackId] = useState<string>(KEEP);
  const [state, setState] = useState<'idle' | 'busy' | 'saved' | 'removed' | 'failed'>('idle');
  // Another place chosen, or its sound read: the fields show what is kept for it.
  const kept = `${locationId}|${stored?.ambience ?? KEEP}|${stored?.trackId ?? KEEP}`;
  useEffect(() => {
    setAmbience(stored?.ambience ?? KEEP);
    setTrackId(stored?.trackId ?? KEEP);
    // `kept` stands for the stored values: the effect follows them, not the object read anew.
  }, [kept]);
  // What was said of one place is not said of the next.
  useEffect(() => {
    setState('idle');
  }, [locationId]);
  // A track deleted since: the place no longer brings it, and the field says so.
  const known = trackId === KEEP || !tracksRead || list.some((track) => track.trackId === trackId);
  const changed =
    ambience !== (stored?.ambience ?? KEEP) || (known ? trackId : KEEP) !== (stored?.trackId ?? KEEP);
  // Both left as they are, with something kept: the press takes the place's sound away.
  const removing = stored !== null && ambience === KEEP && (trackId === KEEP || !known);
  const save = () => {
    if (state === 'busy' || !changed) return;
    const done = removing ? 'removed' : 'saved';
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
          setState(done);
          sounds.reread();
        },
        () => {
          setState('failed');
        },
      );
  };
  if (sounds.resource.status === 'error') {
    // Unread, a kept sound still comes with the place: the DM is told before pressing.
    return (
      <p role="status" className="field-hint">
        {t('This place’s sound could not be read. Showing the place may still switch it on.')}
      </p>
    );
  }
  if (sounds.resource.status !== 'ready') return null;
  return (
    <fieldset className="place-sound" aria-describedby={`${ids}-hint`}>
      <legend>{t('The sound of {place}', { place: placeName })}</legend>
      <p className="field-hint" id={`${ids}-hint`}>
        {t(
          'When you show this place, the table’s sound changes to what is kept here; music starts from its beginning, on repeat. “Leave as it is” changes nothing; “No sound” silences the ambience. You can change it afterwards in Session.',
        )}{' '}
        {t('It plays on the table’s screen and, online, on every screen.')}
      </p>
      <div className="screen-cast-row">
        <div className="field">
          <label htmlFor={`${ids}-ambience`}>{t('Ambience')}</label>
          <select
            id={`${ids}-ambience`}
            value={ambience}
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
            aria-describedby={`${ids}-track-hint`}
            onChange={(event) => {
              setTrackId(event.target.value);
              setState('idle');
            }}
          >
            <option value={KEEP}>{t('Leave as it is')}</option>
            {/* The kept track, while the list of tracks is not read yet. */}
            {!tracksRead && trackId !== KEEP && <option value={trackId}>{t('The kept track')}</option>}
            {list.map((track) => (
              <option key={track.trackId} value={track.trackId}>
                {track.title}
              </option>
            ))}
          </select>
          <p className="field-hint" id={`${ids}-track-hint`}>
            {!known
              ? t('The kept track was deleted: this place now brings no music.')
              : tracksRead && list.length === 0
                ? t('Add a track in Session to choose it here.')
                : ''}
          </p>
        </div>
      </div>
      <div className="action-row">
        <button type="button" aria-disabled={state === 'busy' || !changed} onClick={save}>
          {removing ? t('Remove this place’s sound') : t('Keep this sound for the place')}
        </button>
        <p role="status" className="place-sound-status">
          {state === 'saved' ? t('Kept.') : state === 'removed' ? t('Removed.') : ''}
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
