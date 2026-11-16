import type { CheckRequestView, CheckRequestsResponse, EntityRef } from '@ltw/contracts';
import { useT } from '@ltw/ui';
import { useCallback } from 'react';

import type { WorldApi } from '../api/client.ts';
import { useResource } from '../api/resource.ts';
import { checkWords } from '../dice/checks.ts';
import { useRereadOn } from '../world/use-world-data.ts';
import { gatherWaits } from './moments.ts';

/**
 * Whom the table waits for (docs/adr/0044-online-play.md §3): the checks the DM asked for and
 * nobody has rolled yet, by name — in the dice cast's own list, and over every other cast as a
 * strip, so the room sees who the game waits on whatever the screen shows. The same ask of the same
 * character is said once with its count, and only a few lines are named (the rest as a number), so
 * the strip never grows over the cast it lies on.
 */
/** How many lines the list names over a cast, and in the dice cast's own. */
const STRIP_LINES = 3;
const LIST_LINES = 5;

export function WaitingList({
  waiting,
  directory,
  most = LIST_LINES,
}: {
  readonly waiting: readonly CheckRequestView[];
  readonly directory: readonly EntityRef[];
  readonly most?: number;
}) {
  const t = useT();
  if (waiting.length === 0) return null;
  const name = (id: string) =>
    directory.find((entity) => entity.entityId === id)?.name ?? t('a character');
  const { lines, more } = gatherWaits(
    waiting.map((request) => ({
      who: name(request.characterId),
      what: checkWords(t, request.check, request.mode),
    })),
    most,
  );
  return (
    <div className="display-waiting" role="status">
      <h2>{t('The table waits for')}</h2>
      <ul>
        {lines.map((line) => (
          <li key={line.key}>
            <strong>{line.who}</strong>
            {' — '}
            {line.what}
            {line.times > 1 && <span className="display-waiting-times"> ×{line.times}</span>}
          </li>
        ))}
      </ul>
      {more > 0 && <p className="display-waiting-more">{t('and {count} more', { count: more })}</p>}
    </div>
  );
}

export function WaitingStrip({
  api,
  refresh,
  directory,
  low,
}: {
  readonly api: WorldApi;
  readonly refresh: number;
  readonly directory: readonly EntityRef[];
  /** Beside the battlefield the strip stands at the foot, clear of the turn order. */
  readonly low: boolean;
}) {
  const load = useCallback(
    (signal: AbortSignal) => api.get<CheckRequestsResponse>('check-requests', signal),
    [api],
  );
  const asked = useResource('display-waiting', load);
  useRereadOn(refresh, asked.reread);
  const waiting =
    asked.resource.status === 'ready'
      ? asked.resource.value.requests.filter((request) => request.status === 'open')
      : [];
  return (
    <div className={low ? 'display-waiting-strip is-low' : 'display-waiting-strip'}>
      <WaitingList waiting={waiting} directory={directory} most={STRIP_LINES} />
    </div>
  );
}
