import {
  ambienceFor,
  type Ambience,
  type AmbienceChoice,
  type KnownEntitiesResponse,
  type ScenePresentationResponse,
  type SceneSound,
} from '@ltw/contracts';
import { useT } from '@ltw/ui';
import { useCallback, useEffect, useSyncExternalStore } from 'react';

import type { WorldApi } from '../api/client.ts';
import { useResource } from '../api/resource.ts';
import { onSoundChange, soundOut, soundRunning, unlockAudio } from '../dice/audio.ts';
import { useDiceSettings } from '../dice/settings.ts';
import { useRereadOn } from '../world/use-world-data.ts';
import { AmbiencePlayer } from './ambience.ts';

/** One player a page: a screen plays the table's ambience once, wherever it is asked from. */
let player: AmbiencePlayer | null = null;

/** Whether the table's sound waits on this page for a press: "Sound on" shows while it does. */
let waiting = false;
const waitListeners = new Set<() => void>();

function wait(next: boolean): void {
  if (waiting === next) return;
  waiting = next;
  for (const listener of waitListeners) listener();
}

const onWait = (listener: () => void) => {
  waitListeners.add(listener);
  return () => {
    waitListeners.delete(listener);
  };
};

/** Twice a second the player plays the moments due. */
const FILL_MS = 500;

/** Whether sound runs on this screen: a press unlocked it and the browser lets it play. */
export const useSoundRunning = (): boolean =>
  useSyncExternalStore(onSoundChange, soundRunning, () => false);

/**
 * The place of the scene being played, as this screen's perspective knows it, for a screen that
 * has not read the world's directory (the DM's choice); null while not asked for or not known.
 */
export function useScenePlace(api: WorldApi, refresh: number, wanted: boolean): string | null {
  const loadPlace = useCallback(
    (signal: AbortSignal) =>
      wanted ? api.get<KnownEntitiesResponse>('entities', signal) : Promise.resolve(null),
    [api, wanted],
  );
  const place = useResource(`sound-place:${String(wanted)}`, loadPlace);
  useRereadOn(refresh, place.reread);
  return place.resource.status === 'ready' ? (place.resource.value?.scenePlaceId ?? null) : null;
}

/**
 * The scene at `placeId` as this screen's perspective sees it — where the place is, its weather,
 * the hour — for the ambience "by the scene" (docs/adr/0059-atmosphere.md §1); read only while
 * `wanted`, so a screen that plays nothing reads nothing; null until then.
 */
export function useSceneSound(
  api: WorldApi,
  refresh: number,
  placeId: string | null,
  wanted: boolean,
): SceneSound | null {
  const read = wanted ? placeId : null;
  const loadScene = useCallback(
    (signal: AbortSignal) =>
      read === null
        ? Promise.resolve(null)
        : api.get<ScenePresentationResponse>(`locations/${encodeURIComponent(read)}/scene`, signal),
    [api, read],
  );
  const scene = useResource(`sound-scene:${read ?? ''}`, loadScene);
  useRereadOn(refresh, scene.reread);
  const value = scene.resource.status === 'ready' ? scene.resource.value : null;
  return value
    ? { setting: value.setting, weather: value.location.weather, night: value.phase === 'night' }
    : null;
}

/** Plays an ambience on this screen at its volume while sound runs; silence for null. */
function useAmbience(ambience: Ambience | null, volume: number, running: boolean): void {
  useEffect(() => {
    const out = running ? soundOut() : null;
    if (!out) return;
    player ??= new AmbiencePlayer(out.context, out.out);
    player.volume(volume);
    player.play(ambience);
  }, [ambience, volume, running]);
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => {
      player?.fill();
    }, FILL_MS);
    return () => {
      window.clearInterval(timer);
    };
  }, [running]);
  // A screen that leaves the table lets its ambience fade out.
  useEffect(
    () => () => {
      player?.play(null);
    },
    [],
  );
}

/** Whether the table's sound waits on this page for its first press. */
export function useSoundWaiting(): boolean {
  const wanted = useSyncExternalStore(
    onWait,
    () => waiting,
    () => false,
  );
  const running = useSoundRunning();
  return wanted && !running;
}

/**
 * The one "Sound on" (ADR 0059 §6): a browser plays only after a press, so while the table's sound
 * waits for one on this page, this button shows in the world's top bar (the table's screen has it
 * in its quiet corner) and goes once sound runs.
 */
export function SoundOnButton({ className }: { readonly className: string }) {
  const t = useT();
  if (!useSoundWaiting()) return null;
  return (
    <button type="button" className={className} onClick={unlockAudio}>
      {t('Sound on')}
    </button>
  );
}

/**
 * The table's ambience on this screen (ADR 0059 §1): the DM's choice — one soundscape, none, or
 * by the scene (the scene at `placeId`, read once sound runs) — at this screen's volume, unless
 * this screen turned the table's sound off. Until a press lets it play, it asks for the "Sound on"
 * button. `choice` is null until the table's state is read.
 */
export function TableAmbience({
  api,
  refresh,
  choice,
  placeId,
}: {
  readonly api: WorldApi;
  readonly refresh: number;
  readonly choice: AmbienceChoice | null;
  readonly placeId: string | null;
}) {
  const settings = useDiceSettings();
  const running = useSoundRunning();
  const on = settings.atmosphere && choice !== null && choice !== 'none';
  const scene = useSceneSound(api, refresh, placeId, on && running && choice === 'scene');
  const heard = on ? ambienceFor(choice, scene) : null;
  useAmbience(heard, settings.atmosphereVolume, running);
  const asking = on;
  useEffect(() => {
    wait(asking);
    return () => {
      wait(false);
    };
  }, [asking]);
  // What plays, for tests to read: hidden, so it never takes a share of the screen's layout.
  return (
    <div
      className="table-sound"
      hidden
      data-ambience={heard ?? 'none'}
      data-sound={running ? 'on' : 'off'}
    />
  );
}
