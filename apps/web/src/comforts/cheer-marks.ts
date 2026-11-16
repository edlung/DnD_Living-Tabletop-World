import { CHEER_MARKS, type CheerMark, type CheerView, type CheersResponse } from '@ltw/contracts';
import type { Translate } from '@ltw/ui';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { WorldApi } from '../api/client.ts';
import { useResource } from '../api/resource.ts';

/**
 * Cheers at the table as a screen shows them (docs/adr/0072-keepsakes.md §3). The marks are the
 * system's own emoji, written as text — the application draws no art of its own — and each has a
 * word for a reader who does not see it.
 */
export const CHEER_SIGNS: Readonly<Record<CheerMark, string>> = {
  applause: '👏',
  laugh: '😂',
  wow: '😮',
  fright: '😱',
  heart: '❤️',
};

export const CHEER_WORDS: Readonly<Record<CheerMark, string>> = {
  applause: 'Applause',
  laugh: 'Laughter',
  wow: 'Wow!',
  fright: 'Scary!',
  heart: 'Love it!',
};

export const cheerMarks: readonly CheerMark[] = CHEER_MARKS;

/** Whose cheer, in the reader's words. */
export const cheerBy = (t: Translate, cheer: Pick<CheerView, 'by'>): string =>
  cheer.by === null ? t('The DM') : (cheer.by.name ?? t('Someone'));

/** How long a cheer stays on a screen. */
export const SHOWN_MS = 4_000;
/** Cheers on a screen at once: a burst of applause, not a wall of it. */
export const SHOWN_AT_ONCE = 6;

export interface ShownCheer extends CheerView {
  /** Where across the layer it rises (0–1), so a burst does not stack in one spot. */
  readonly lane: number;
}

/** A place across the layer from a cheer's ID: the same on every screen, with no dice thrown. */
export function laneOf(cheerId: string): number {
  let sum = 0;
  for (const char of cheerId) sum = (sum * 31 + char.charCodeAt(0)) % 997;
  return (sum % 5) / 4;
}

/**
 * The cheers this screen is showing: each one the server still holds is shown once, for a moment,
 * from when this screen first read it. `add` shows the viewer's own at once, before the server
 * says so; its ID keeps it from being shown again.
 */
export function useShownCheers(api: WorldApi, enabled = true) {
  const load = useCallback(
    (signal: AbortSignal) =>
      enabled ? api.get<CheersResponse>('cheers', signal).catch(() => null) : Promise.resolve(null),
    [api, enabled],
  );
  const read = useResource(`cheers:${String(enabled)}`, load);
  const held = read.resource.status === 'ready' ? read.resource.value : null;
  const seen = useRef(new Set<string>());
  const timers = useRef(new Set<number>());
  const [shown, setShown] = useState<readonly ShownCheer[]>([]);
  const add = useCallback((cheer: CheerView) => {
    if (seen.current.has(cheer.cheerId)) return;
    seen.current.add(cheer.cheerId);
    setShown((now) => [...now, { ...cheer, lane: laneOf(cheer.cheerId) }].slice(-SHOWN_AT_ONCE));
    const timer = window.setTimeout(() => {
      timers.current.delete(timer);
      setShown((now) => now.filter((one) => one.cheerId !== cheer.cheerId));
    }, SHOWN_MS);
    timers.current.add(timer);
  }, []);
  useEffect(() => {
    for (const cheer of held?.cheers ?? []) add(cheer);
  }, [held, add]);
  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending) window.clearTimeout(timer);
    };
  }, []);
  return { shown, add };
}

/** Gives a cheer. False when it did not go through (a thumb too fast, a table out of reach). */
export const sendCheer = (api: WorldApi, cheerId: string, mark: CheerMark): Promise<boolean> =>
  api.post('cheers', { cheerId, mark }, AbortSignal.timeout(10_000), true).then(
    () => true,
    () => false,
  );
