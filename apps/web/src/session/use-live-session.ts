import { useCallback, useEffect, useRef, useState } from 'react';

import type { Connection } from '../api/client.ts';
import { LiveClient, type LiveStatus } from '../api/live.ts';
import type { LiveTargetReporter } from '../api/live-context.ts';

/** A page hidden at least this long starts a fresh live stream when it shows again. */
const RESUME_AFTER_MS = 10_000;

/**
 * The session screen's one live connection (docs/adr/0033-live-session.md §4): opened with
 * the session, following the perspective and what the world screen shows, and closed when
 * the session ends. `refresh` counts the coalesced signals that ask for a background re-read.
 */
export function useLiveSession(
  connection: Connection,
  perspective: string,
): {
  readonly status: LiveStatus;
  readonly refresh: number;
  readonly report: LiveTargetReporter;
} {
  const [status, setStatus] = useState<LiveStatus>('connecting');
  const [refresh, setRefresh] = useState(0);
  const [target, setTarget] = useState<{
    readonly focus: string | null;
    readonly place: string | null;
  }>({ focus: null, place: null });
  const client = useRef<LiveClient | null>(null);
  useEffect(() => {
    const live = new LiveClient({
      connection,
      onStatus: setStatus,
      onRefresh: () => {
        setRefresh((value) => value + 1);
      },
      online: () => navigator.onLine,
    });
    client.current = live;
    const wake = () => {
      live.wake();
    };
    // A page hidden for a while (a locked phone) may have lost its stream unseen: it starts a
    // fresh one when it shows again, and the open questions come back with the views.
    let hiddenAt: number | null = null;
    const shown = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt = Date.now();
        return;
      }
      if (hiddenAt !== null && Date.now() - hiddenAt >= RESUME_AFTER_MS) live.resume();
      hiddenAt = null;
    };
    window.addEventListener('online', wake);
    document.addEventListener('visibilitychange', shown);
    return () => {
      window.removeEventListener('online', wake);
      document.removeEventListener('visibilitychange', shown);
      live.close();
      client.current = null;
    };
  }, [connection]);
  useEffect(() => {
    client.current?.subscribe({ perspective, focus: target.focus, place: target.place });
  }, [perspective, target]);
  const report = useCallback<LiveTargetReporter>((focus, place) => {
    setTarget((current) =>
      current.focus === focus && current.place === place ? current : { focus, place },
    );
  }, []);
  return { status, refresh, report };
}
