import type { PresenceResponse } from '@ltw/contracts';
import { StatusPanel, useT } from '@ltw/ui';
import { useCallback } from 'react';

import type { WorldApi } from '../api/client.ts';
import { useResource } from '../api/resource.ts';
import { useRereadOn } from '../world/use-world-data.ts';
import { DowntimeCard } from './downtime-card.tsx';
import type { DmTableCommand } from './table-commands.ts';
import { ToolboxForms } from './toolbox-forms.tsx';

/**
 * The appendix of the heroes' part (docs/adr/0075-book-interface.md §18): the tools an evening
 * rarely needs — a trap sprung, a mind under stress, a contagion, the days between adventures —
 * on a page of their own, so the Party's page holds what every evening does. Each tool is as it
 * was on the Party's page: its words, its commands, the World Engine's dice.
 */
export function AppendixSheet({
  api,
  open,
  revision,
  locked,
  onRun,
}: {
  readonly api: WorldApi;
  readonly open: boolean;
  readonly revision: number;
  readonly locked: boolean;
  readonly onRun: (command: DmTableCommand) => void;
}) {
  const t = useT();
  const load = useCallback(
    (signal: AbortSignal) => api.get<PresenceResponse>('presence', signal),
    [api],
  );
  const presence = useResource('appendix-presence', load);
  useRereadOn(revision, presence.reread);
  if (!open) return null;
  if (presence.resource.status !== 'ready') {
    return (
      <StatusPanel
        state={presence.resource.status === 'error' ? 'error' : 'loading'}
        label={
          presence.resource.status === 'error' ? presence.resource.message : t('Reading the party…')
        }
        onRetry={presence.retry}
      />
    );
  }
  const characters = presence.resource.value.characters.map((entry) => entry.character);
  return (
    <div className="party-sheet">
      <div className="party-tools">
        {characters.length === 0 && (
          <p className="muted">{t('No characters are at the table yet.')}</p>
        )}
        <ToolboxForms characters={characters} locked={locked} onRun={onRun} />
        <DowntimeCard api={api} revision={revision} locked={locked} onRun={onRun} />
      </div>
    </div>
  );
}
