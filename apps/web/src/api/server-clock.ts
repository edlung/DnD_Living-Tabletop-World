import type { ClockResponse } from '@ltw/contracts';
import { useEffect, useState } from 'react';

import type { WorldApi } from './client.ts';

/** A screen's clock drifts slowly: it is checked again every five minutes. */
const AGAIN_MS = 5 * 60_000;

/**
 * How far the server's clock is ahead of this screen's, in ms (docs/adr/0059-atmosphere.md §3: the
 * DM's music plays in step by it), from the clock's answer and half the time it took; 0 before it
 * is read, or when it cannot be, so the screen's own clock stands in.
 */
export function useServerClock(api: WorldApi): number {
  const [offset, setOffset] = useState(0);
  useEffect(() => {
    let open = true;
    const read = async () => {
      const sent = Date.now();
      try {
        const answer = await api.get<ClockResponse>('clock', AbortSignal.timeout(10_000), false);
        const now = Date.parse(answer.now);
        if (open && !Number.isNaN(now)) setOffset(now - (sent + Date.now()) / 2);
      } catch {
        // The screen's own clock stands in.
      }
    };
    void read();
    const timer = window.setInterval(() => void read(), AGAIN_MS);
    return () => {
      open = false;
      window.clearInterval(timer);
    };
  }, [api]);
  return offset;
}
