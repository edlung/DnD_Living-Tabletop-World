import { useEffect, useSyncExternalStore } from 'react';

import { unlockAudio } from '../dice/audio.ts';
import { changeDiceSettings } from '../dice/settings.ts';
import { nativeShell, onShellMessage, type NativeShell } from './shell.ts';

/**
 * The sound of LTW DM's TV (docs/adr/0070-native-apps.md §6): nobody can press "Sound on" on a TV
 * that only shows a window, so there the sound starts by itself, and the DM sets it from the Table
 * screen sheet — on or off and its volume. The DM's page says it to the app (`tv-sound`), the app
 * to the TV's page (`sound`), which keeps it as its own dice settings. The DM's choice is kept in
 * the DM's browser storage and said again whenever the TV's state changes.
 */
export interface TvSound {
  readonly on: boolean;
  /** 0–100. */
  readonly volume: number;
}

const KEY = 'ltw.tv-sound';
const DEFAULT: TvSound = { on: true, volume: 70 };

const whole = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 100;

function read(): TvSound {
  try {
    const stored = JSON.parse(
      window.localStorage.getItem(KEY) ?? 'null',
    ) as Partial<TvSound> | null;
    if (!stored || typeof stored !== 'object') return DEFAULT;
    return {
      on: typeof stored.on === 'boolean' ? stored.on : DEFAULT.on,
      volume: whole(stored.volume) ? stored.volume : DEFAULT.volume,
    };
  } catch {
    return DEFAULT;
  }
}

let current: TvSound | null = null;
const listeners = new Set<() => void>();
const snapshot = (): TvSound => (current ??= read());
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** Whether this page is LTW DM's and its app carries the TV's sound. */
export const carriesTvSound = (shell: NativeShell | null = nativeShell()): boolean =>
  shell?.app === 'dm' && shell.has('tv-sound');

/** Says the DM's choice to the app again (the TV's page may have just started). */
export function sayTvSound(shell: NativeShell | null = nativeShell()): void {
  if (!carriesTvSound(shell)) return;
  shell?.post({ type: 'tv-sound', ...snapshot() });
}

export function changeTvSound(change: Partial<TvSound>, shell: NativeShell | null = nativeShell()) {
  const next = { ...snapshot(), ...change };
  current = { on: next.on, volume: whole(next.volume) ? next.volume : DEFAULT.volume };
  try {
    window.localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    // Storage may be unavailable: the choice holds for this page.
  }
  for (const listener of listeners) listener();
  sayTvSound(shell);
}

/** The DM's choice of the TV's sound, in LTW DM. */
export const useTvSound = (): TvSound => useSyncExternalStore(subscribe, snapshot, () => DEFAULT);

/** Whether this page is the TV's own window in LTW DM, where sound needs no press. */
export const hostedTv = (shell: NativeShell | null = nativeShell()): boolean =>
  shell?.app === 'tv' && shell.has('sound');

/** What the app's `sound` message makes of the screen's own settings. */
export function applyTvSound(sound: TvSound): void {
  const share = sound.volume / 100;
  changeDiceSettings({
    sound: sound.on,
    atmosphere: sound.on,
    volume: share,
    atmosphereVolume: share,
  });
}

/**
 * On the TV's own page: sound starts without a press, and follows what the DM sets. Nothing in a
 * browser or in the DM's own window.
 */
export function useHostedTvSound(shell: NativeShell | null = nativeShell()): void {
  const hosted = hostedTv(shell);
  useEffect(() => {
    if (!hosted) return;
    unlockAudio();
    const stop = onShellMessage((message) => {
      if (message.type !== 'sound') return;
      applyTvSound(message);
      // A context the system suspended meanwhile starts again with the DM's word.
      unlockAudio();
    });
    // The listener is up only now: the app says again what it holds (the DM's last word).
    shell?.post({ type: 'ready' });
    return stop;
  }, [hosted, shell]);
}
