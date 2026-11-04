import {
  ambienceFor,
  type Ambience,
  type AmbienceChoice,
  type KnownEntitiesResponse,
  type ScenePresentationResponse,
  type SceneSound,
} from '@ltw/contracts';
import { useCallback, useEffect } from 'react';

import type { WorldApi } from '../api/client.ts';
import { useResource } from '../api/resource.ts';
import { soundOut } from '../dice/audio.ts';
import { useDiceSettings } from '../dice/settings.ts';
import { useRereadOn } from '../world/use-world-data.ts';
import { AmbiencePlayer } from './ambience.ts';
import { useSoundRunning, useWaitForSound } from './sound-on.tsx';

/** One player a page: a screen plays the table's ambience once, wherever it is asked from. */
let player: AmbiencePlayer | null = null;
/** The DM's music plays: the ambience sits lower beneath it (ADR 0059 §3). */
let ducked = false;

/** Lowers the ambience beneath the music, or brings it back. */
export function duckAmbience(on: boolean): void {
  ducked = on;
  player?.duck(on);
}

/** Twice a second the player plays the moments due. */
const FILL_MS = 500;

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
    if (!player) {
      player = new AmbiencePlayer(out.context, out.out);
      player.duck(ducked);
    }
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
  useWaitForSound('ambience', on);
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
