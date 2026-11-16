import type { CastResponse, EncounterResponse } from '@ltw/contracts';
import { useT } from '@ltw/ui';
import { useCallback, useEffect, useState } from 'react';

import type { WorldApi } from '../api/client.ts';
import type { LiveStatus } from '../api/live.ts';
import { useResource } from '../api/resource.ts';
import { useRereadOn } from '../world/use-world-data.ts';
import { followedCast, followsFight } from './moments.ts';

/** The live signal away this long is said on the screen; a blink of the network is not. */
const AWAY_MS = 4_000;

/**
 * The cast as the screen shows it (docs/adr/0042-table-display.md §3): the DM's, except that a
 * scene cast to "where the party is" shows the battlefield while the party takes part in a fight.
 * The fight is read in the PARTY perspective like everything here, so a fight the party is not in
 * changes nothing.
 */
export function useFollowedCast(
  api: WorldApi,
  cast: CastResponse | null,
  refresh: number,
): CastResponse | null {
  const follows = cast !== null && followsFight(cast);
  const load = useCallback(
    (signal: AbortSignal) =>
      follows ? api.get<EncounterResponse>('encounter', signal) : Promise.resolve(null),
    [api, follows],
  );
  const fight = useResource(`display-fight:${String(follows)}`, load);
  useRereadOn(refresh, fight.reread);
  const fighting =
    fight.resource.status === 'ready' && (fight.resource.value?.encounter ?? null) !== null;
  return cast === null ? null : followedCast(cast, fighting);
}

/**
 * The room is told when the screen has lost the table (work-orders/NATIVE_TV_POLISH_2026-11-15.md
 * §1): the live signal away, or the browser offline, for a few seconds — a small plate, while the
 * screen keeps what it last saw and every read keeps trying. Gone once the signal is back.
 */
export function LinkPlate({ status }: { readonly status: LiveStatus }) {
  const t = useT();
  const [offline, setOffline] = useState(() => !navigator.onLine);
  useEffect(() => {
    const changed = () => {
      setOffline(!navigator.onLine);
    };
    window.addEventListener('online', changed);
    window.addEventListener('offline', changed);
    return () => {
      window.removeEventListener('online', changed);
      window.removeEventListener('offline', changed);
    };
  }, []);
  const away = offline || status === 'reconnecting' || status === 'offline';
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!away) {
      setShown(false);
      return;
    }
    const timer = window.setTimeout(() => {
      setShown(true);
    }, AWAY_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, [away]);
  if (!shown) return null;
  return (
    <p className="display-link-plate" role="status">
      {t('No connection to the table: the screen shows what it last saw and keeps trying.')}
    </p>
  );
}
