import { useEffect } from 'react';

import { holdAwake, tellWaiting } from '../native/signals.ts';

/**
 * The screen kept awake while a session runs (docs/adr/0044-online-play.md §3, plan decision 10):
 * a phone on the table or the TV does not dim mid-game. The browser lets go of a Screen Wake Lock
 * whenever the page is hidden, so it is asked for again when the page shows; where the browser has
 * none, or refuses (a battery saver), the screen may dim as before. In the apps the shell keeps it
 * on as well (docs/adr/0070-native-apps.md §5).
 */
export function useScreenAwake(active: boolean): void {
  useEffect(() => (active ? holdAwake() : undefined), [active]);
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let live = true;
    const ask = async () => {
      if (document.visibilityState !== 'visible' || lock !== null) return;
      try {
        const next = await navigator.wakeLock.request('screen');
        if (!live) {
          void next.release();
          return;
        }
        lock = next;
        next.addEventListener('release', () => {
          if (lock === next) lock = null;
        });
      } catch {
        // Refused: the screen may dim.
      }
    };
    void ask();
    const shown = () => {
      void ask();
    };
    document.addEventListener('visibilitychange', shown);
    return () => {
      live = false;
      document.removeEventListener('visibilitychange', shown);
      void lock?.release();
      lock = null;
    };
  }, [active]);
}

const COUNTED = /^\(\d+\) /;

/**
 * How many questions wait for this player, in the tab's title — "(2) The Missing Caravan" — so a
 * tab in the background still says the table waits (plan decision 10); in the apps the shell shows
 * it as the badge and notifies a rise while the app is out of view (ADR 0070 §5).
 */
export function useTitleCount(count: number): void {
  // The count as it changes, and nothing waiting once the table is left: a fall is never a rise.
  useEffect(() => {
    tellWaiting(count);
  }, [count]);
  useEffect(
    () => () => {
      tellWaiting(0);
    },
    [],
  );
  useEffect(() => {
    const plain = document.title.replace(COUNTED, '');
    document.title = count > 0 ? `(${String(count)}) ${plain}` : plain;
    return () => {
      document.title = document.title.replace(COUNTED, '');
    };
  }, [count]);
}
