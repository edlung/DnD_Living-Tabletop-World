import {
  MAX_TRACK_BYTES,
  type MusicChange,
  type MusicPlaying,
  type TrackListResponse,
  type TrackView,
} from '@ltw/contracts';
import { useT } from '@ltw/ui';
import { useCallback, useId, useState, type ChangeEvent } from 'react';

import type { WorldApi } from '../api/client.ts';
import { useResource } from '../api/resource.ts';
import { Glyph } from '../visual/glyph.tsx';
import { useRereadOn } from '../world/use-world-data.ts';

const ACCEPT = 'audio/mpeg,audio/ogg,audio/mp4,audio/x-m4a,audio/wav,.mp3,.ogg,.oga,.m4a,.wav';

const REFUSED = {
  size: 'This file is larger than 15 MB.',
  audio: 'This file is not an MP3, OGG, M4A or WAV sound.',
  limit: 'Thirty tracks are kept already. Delete one first.',
  failed: 'The track could not be added. Try again.',
} as const;
type Refusal = keyof typeof REFUSED;

/** A track's title from its file's name, as the DM named the file. */
const titleOf = (file: File) =>
  (file.name.replace(/\.[a-z0-9]{2,4}$/i, '').trim() || 'Track').slice(0, 80);

const megabytes = (bytes: number) => Math.max(0.1, Math.round((bytes / 1024 / 1024) * 10) / 10);

/**
 * The DM's music (docs/adr/0059-atmosphere.md §3), on the Session sheet: tracks added from the DM's
 * own files — MP3, OGG, M4A or WAV of up to 15 MB, thirty at most — each played once or on repeat,
 * or deleted (asked first); the track playing paused, resumed or stopped. It plays on the table's
 * screen and, online, on every screen, from the same moment.
 */
export function MusicPanel({
  api,
  revision,
  music,
  onChange,
}: {
  readonly api: WorldApi;
  readonly revision: number;
  readonly music: MusicPlaying | null;
  readonly onChange: (change: MusicChange) => Promise<boolean>;
}) {
  const t = useT();
  const ids = useId();
  const [round, setRound] = useState(0);
  const load = useCallback(
    (signal: AbortSignal) => api.get<TrackListResponse>('music', signal, false),
    [api],
  );
  const list = useResource('dm-music', load);
  useRereadOn(revision + round, list.reread);
  const tracks = list.resource.status === 'ready' ? list.resource.value.tracks : [];
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<Refusal | null>(null);
  const [asking, setAsking] = useState<string | null>(null);
  const add = async (file: File) => {
    setRefusal(null);
    if (file.size > MAX_TRACK_BYTES) {
      setRefusal('size');
      return;
    }
    setBusy(true);
    const added = await api.uploadTrack(
      file,
      titleOf(file),
      crypto.randomUUID(),
      AbortSignal.timeout(130_000),
    );
    setBusy(false);
    if (typeof added === 'string') setRefusal(added);
    setRound((value) => value + 1);
  };
  const chosen = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) void add(file);
  };
  const remove = async (track: TrackView) => {
    setAsking(null);
    await api
      .post(`music/${encodeURIComponent(track.trackId)}/delete`, {}, AbortSignal.timeout(20_000))
      .catch(() => undefined);
    setRound((value) => value + 1);
  };
  const playing = music ? (tracks.find((track) => track.trackId === music.trackId) ?? null) : null;
  return (
    <section className="tool-group music-panel" aria-labelledby={`${ids}-title`}>
      <h3 id={`${ids}-title`}>
        <Glyph name="perform" />
        {t('Music')}
      </h3>
      {music && playing && (
        <div className="music-now">
          <p role="status">
            {t(music.pausedAt === null ? 'Playing: {title}' : 'Paused: {title}', {
              title: playing.title,
            })}
            {music.repeat ? ` · ${t('on repeat')}` : ''}
          </p>
          <div className="action-row">
            <button
              type="button"
              onClick={() =>
                void onChange({ action: music.pausedAt === null ? 'pause' : 'resume' })
              }
            >
              {music.pausedAt === null ? t('Pause') : t('Resume')}
            </button>
            <button type="button" onClick={() => void onChange({ action: 'stop' })}>
              {t('Stop')}
            </button>
          </div>
        </div>
      )}
      {list.resource.status === 'ready' && tracks.length === 0 && (
        <p className="muted">{t('No tracks yet.')}</p>
      )}
      {tracks.length > 0 && (
        <ul className="music-list" aria-label={t('Tracks')}>
          {tracks.map((track) => (
            <li key={track.trackId} className="music-row">
              <div className="music-row-head">
                <strong>{track.title}</strong>
                <span className="muted">{t('{size} MB', { size: megabytes(track.bytes) })}</span>
              </div>
              {asking === track.trackId ? (
                <div
                  className="action-row"
                  role="group"
                  aria-label={t('Delete “{title}”?', { title: track.title })}
                >
                  <span>{t('Delete “{title}”?', { title: track.title })}</span>
                  <button
                    type="button"
                    className="danger-button"
                    onClick={() => void remove(track)}
                  >
                    {t('Delete')}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAsking(null);
                    }}
                  >
                    {t('Keep')}
                  </button>
                </div>
              ) : (
                <div className="action-row">
                  <button
                    type="button"
                    aria-label={t('Play once: {title}', { title: track.title })}
                    onClick={() =>
                      void onChange({ action: 'play', trackId: track.trackId, repeat: false })
                    }
                  >
                    {t('Play once')}
                  </button>
                  <button
                    type="button"
                    aria-label={t('Play on repeat: {title}', { title: track.title })}
                    onClick={() =>
                      void onChange({ action: 'play', trackId: track.trackId, repeat: true })
                    }
                  >
                    {t('Play on repeat')}
                  </button>
                  <button
                    type="button"
                    className="quiet-button"
                    aria-label={t('Delete: {title}', { title: track.title })}
                    onClick={() => {
                      setAsking(track.trackId);
                    }}
                  >
                    {t('Delete')}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="muted" id={`${ids}-hint`}>
        {t('MP3, OGG, M4A or WAV, up to 15 MB each; thirty tracks at most.')}
      </p>
      <label className={`file-button${busy ? ' is-busy' : ''}`}>
        <input
          type="file"
          accept={ACCEPT}
          className="visually-hidden"
          aria-describedby={`${ids}-hint`}
          disabled={busy}
          onChange={chosen}
        />
        {busy ? t('Adding the track…') : t('Add a track')}
      </label>
      {refusal && (
        <p className="authoring-notice error" role="alert">
          {t(REFUSED[refusal])}
        </p>
      )}
    </section>
  );
}
