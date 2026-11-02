import type { CheckRequestView, CheckRequestsResponse, EntityRef } from '@ltw/contracts';
import { useT } from '@ltw/ui';
import { useCallback } from 'react';

import type { WorldApi } from '../api/client.ts';
import { useResource } from '../api/resource.ts';
import { checkWords } from '../dice/checks.ts';
import { useRereadOn } from '../world/use-world-data.ts';

/**
 * Whom the table waits for (docs/adr/0044-online-play.md §3): the checks the DM asked for and
 * nobody has rolled yet, by name — in the dice cast's own list, and over every other cast as a
 * strip, so the room sees who the game waits on whatever the screen shows.
 */
export function WaitingList({
  waiting,
  directory,
}: {
  readonly waiting: readonly CheckRequestView[];
  readonly directory: readonly EntityRef[];
}) {
  const t = useT();
  if (waiting.length === 0) return null;
  const name = (id: string) =>
    directory.find((entity) => entity.entityId === id)?.name ?? t('a character');
  return (
    <div className="display-waiting" role="status">
      <h2>{t('The table waits for')}</h2>
      <ul>
        {waiting.map((request) => (
          <li key={request.requestId}>
            <strong>{name(request.characterId)}</strong>
            {' — '}
            {checkWords(t, request.check, request.mode)}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function WaitingStrip({
  api,
  refresh,
  directory,
}: {
  readonly api: WorldApi;
  readonly refresh: number;
  readonly directory: readonly EntityRef[];
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
    <div className="display-waiting-strip">
      <WaitingList waiting={waiting} directory={directory} />
    </div>
  );
}
