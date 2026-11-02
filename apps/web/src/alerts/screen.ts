import { useEffect } from 'react';

/**
 * The screen kept awake while a session runs (docs/adr/0044-online-play.md §3, plan decision 10):
 * a phone on the table or the TV does not dim mid-game. The browser lets go of a Screen Wake Lock
 * whenever the page is hidden, so it is asked for again when the page shows; where the browser has
 * none, or refuses (a battery saver), the screen may dim as before.
 */
export function useScreenAwake(active: boolean): void {
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
 * tab in the background still says the table waits (plan decision 10).
 */
export function useTitleCount(count: number): void {
  useEffect(() => {
    const plain = document.title.replace(COUNTED, '');
    document.title = count > 0 ? `(${String(count)}) ${plain}` : plain;
    return () => {
      document.title = document.title.replace(COUNTED, '');
    };
  }, [count]);
}
