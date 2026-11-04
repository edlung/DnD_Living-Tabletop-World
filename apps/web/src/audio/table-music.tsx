import type { MusicPlaying } from '@ltw/contracts';
import { useEffect, useState } from 'react';

import type { WorldApi } from '../api/client.ts';
import { useServerClock } from '../api/server-clock.ts';
import { soundOut } from '../dice/audio.ts';
import { useDiceSettings } from '../dice/settings.ts';
import { MusicPlayer, musicPlan } from './music.ts';
import { useSoundRunning, useWaitForSound } from './sound-on.tsx';
import { duckAmbience } from './table-sound.tsx';

/** One player a page, as for the ambience. */
let player: MusicPlayer | null = null;

/** Every two seconds a screen checks it is still in step with the table. */
const STEP_MS = 2000;

/** What the screen's music does, for tests to read. */
type Shown = 'none' | 'waiting' | 'loading' | 'starting' | 'playing' | 'paused' | 'ended';

/**
 * The DM's music on this screen (docs/adr/0059-atmosphere.md §3): the track the table's state
 * plays, from the same moment as every other screen (by the server's clock), at this screen's
 * volume, the ambience lower beneath it; nothing when this screen turned the table's sound off.
 * Until a press lets it play, it asks for "Sound on".
 */
export function TableMusic({
  api,
  music,
}: {
  readonly api: WorldApi;
  readonly music: MusicPlaying | null;
}) {
  const clock = useServerClock(api);
  const settings = useDiceSettings();
  const running = useSoundRunning();
  const playing = settings.atmosphere ? music : null;
  useWaitForSound('music', playing !== null);
  const trackId = playing?.trackId ?? null;
  // The track's address (with a development persona, its bytes), for the track now played.
  const [source, setSource] = useState<{ trackId: string; src: string } | null>(null);
  useEffect(() => {
    if (trackId === null) return;
    const controller = new AbortController();
    let made: string | null = null;
    void api
      .trackSource(trackId, controller.signal)
      .then((src) => {
        made = src;
        setSource({ trackId, src });
      })
      .catch(() => undefined);
    return () => {
      controller.abort();
      if (made?.startsWith('blob:')) URL.revokeObjectURL(made);
    };
  }, [api, trackId]);
  const src = source !== null && source.trackId === trackId ? source.src : null;
  // Kept in step: on the element's own news and every two seconds.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const out = running ? soundOut() : null;
    if (!out) return;
    player ??= new MusicPlayer(out.context, out.out);
    const next = () => {
      setTick((value) => value + 1);
    };
    const timer = window.setInterval(next, STEP_MS);
    const stop = player.listen(next);
    return () => {
      window.clearInterval(timer);
      stop();
    };
  }, [running]);
  const [shown, setShown] = useState<Shown>('none');
  useEffect(() => {
    const live = running ? player : null;
    if (playing === null) {
      live?.close();
      duckAmbience(false);
      setShown('none');
      return;
    }
    if (!live) {
      setShown('waiting');
      return;
    }
    const plan = musicPlan(playing, Date.now() + clock, live.duration);
    live.volume(settings.atmosphereVolume);
    live.follow(src, playing.repeat, plan);
    duckAmbience(plan.kind === 'playing');
    setShown(plan.kind === 'playing' ? (live.sounding ? 'playing' : 'starting') : plan.kind);
  }, [playing, running, clock, src, settings.atmosphereVolume, tick]);
  // A screen that leaves the table stops its music and brings its ambience back.
  useEffect(
    () => () => {
      player?.close();
      duckAmbience(false);
    },
    [],
  );
  return <div className="table-music" hidden data-music={shown} data-track={trackId ?? ''} />;
}
