import { useT } from '@ltw/ui';
import { useEffect, useSyncExternalStore } from 'react';

import { onSoundChange, soundRunning, unlockAudio } from '../dice/audio.ts';

/**
 * The one "Sound on" (docs/adr/0059-atmosphere.md §6): a browser plays only after a press, so
 * while something on this page waits to be heard — the ambience, the DM's music, the table
 * screen's cues — one button shows (in the world's top bar; the table's screen has it in its
 * quiet corner) and goes once sound runs.
 */
const waiting = new Set<string>();
const listeners = new Set<() => void>();

function waitForSound(reason: string, on: boolean): void {
  if (waiting.has(reason) === on) return;
  if (on) waiting.add(reason);
  else waiting.delete(reason);
  for (const listener of listeners) listener();
}

const onWait = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

const anyWaiting = () => waiting.size > 0;

/** Whether sound runs on this screen: a press unlocked it and the browser lets it play. */
export const useSoundRunning = (): boolean =>
  useSyncExternalStore(onSoundChange, soundRunning, () => false);

/** While mounted and `on`, `reason` waits to be heard on this page. */
export function useWaitForSound(reason: string, on: boolean): void {
  useEffect(() => {
    waitForSound(reason, on);
    return () => {
      waitForSound(reason, false);
    };
  }, [reason, on]);
}

/** Whether something on this page waits for its first press to be heard. */
export function useSoundWaiting(): boolean {
  const wanted = useSyncExternalStore(onWait, anyWaiting, () => false);
  const running = useSoundRunning();
  return wanted && !running;
}

export function SoundOnButton({ className }: { readonly className: string }) {
  const t = useT();
  if (!useSoundWaiting()) return null;
  return (
    <button type="button" className={className} onClick={unlockAudio}>
      {t('Sound on')}
    </button>
  );
}
