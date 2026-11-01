import { useSyncExternalStore } from 'react';

/**
 * The viewer's dice settings (Stage 510): sound on or off and its volume, and whether dice roll
 * across the screen (`auto` follows the system's reduced-motion setting). A per-viewer convenience
 * kept in this browser only; every read and write survives storage being unavailable.
 */
export interface DiceSettings {
  readonly sound: boolean;
  /** 0–1. */
  readonly volume: number;
  readonly motion: 'auto' | 'on' | 'off';
}

const KEY = 'ltw.dice-settings';
const DEFAULTS: DiceSettings = { sound: true, volume: 0.7, motion: 'auto' };

function read(): DiceSettings {
  try {
    const stored = JSON.parse(
      window.localStorage.getItem(KEY) ?? 'null',
    ) as Partial<DiceSettings> | null;
    if (!stored || typeof stored !== 'object') return DEFAULTS;
    return {
      sound: typeof stored.sound === 'boolean' ? stored.sound : DEFAULTS.sound,
      volume:
        typeof stored.volume === 'number' && stored.volume >= 0 && stored.volume <= 1
          ? stored.volume
          : DEFAULTS.volume,
      motion: stored.motion === 'on' || stored.motion === 'off' ? stored.motion : 'auto',
    };
  } catch {
    return DEFAULTS;
  }
}

let current: DiceSettings | null = null;
const listeners = new Set<() => void>();

const snapshot = (): DiceSettings => (current ??= read());

export function changeDiceSettings(change: Partial<DiceSettings>): void {
  current = { ...snapshot(), ...change };
  try {
    window.localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    // Storage may be unavailable (a private window): the choice holds for this page.
  }
  for (const listener of listeners) listener();
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const useDiceSettings = (): DiceSettings =>
  useSyncExternalStore(subscribe, snapshot, () => DEFAULTS);

/** Whether dice roll across the screen now: the setting, or the system's motion preference. */
export function animates(settings: DiceSettings): boolean {
  if (settings.motion !== 'auto') return settings.motion === 'on';
  return !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
