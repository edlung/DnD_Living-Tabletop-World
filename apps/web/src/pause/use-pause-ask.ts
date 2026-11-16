import type { PauseAsksResponse } from '@ltw/contracts';
import { useCallback, useState } from 'react';

import type { WorldApi } from '../api/client.ts';
import { useResource } from '../api/resource.ts';

/**
 * A player's own request for a pause (docs/adr/0073-table-ideas.md §2), as their screen reads it:
 * whether one waits, whether the DM has seen it, and how to ask. The server holds one a minute,
 * so the screen does not count presses.
 */
export interface PauseAskState {
  /** Asked, and the DM has not seen it yet. */
  readonly waiting: boolean;
  /** The DM has seen it (or paused the game): read for a moment, then gone. */
  readonly seen: boolean;
  readonly busy: boolean;
  /** The last press did not reach the server. */
  readonly failed: boolean;
  readonly ask: () => void;
}

export function usePauseAsk(api: WorldApi, key: string): PauseAskState {
  const load = useCallback(
    (signal: AbortSignal) => api.get<PauseAsksResponse>('pause-requests', signal).catch(() => null),
    [api],
  );
  const asks = useResource(`pause-ask:${key}`, load);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const mine = asks.resource.status === 'ready' ? (asks.resource.value?.asks[0] ?? null) : null;
  const { reread } = asks;
  const ask = useCallback(() => {
    setBusy(true);
    setFailed(false);
    void api
      .post('pause-requests', {}, AbortSignal.timeout(20_000), true)
      .then(
        () => undefined,
        () => {
          setFailed(true);
        },
      )
      .finally(() => {
        setBusy(false);
        reread();
      });
  }, [api, reread]);
  return {
    waiting: mine !== null && !mine.seen,
    seen: mine?.seen === true,
    busy,
    failed,
    ask,
  };
}
