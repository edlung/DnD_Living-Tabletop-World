import type { LobbyResponse, TableDice } from '@ltw/contracts';
import { StatusPanel, useT } from '@ltw/ui';
import { useCallback, useEffect, useId, useState } from 'react';

import type { WorldApi } from '../api/client.ts';
import { useResource } from '../api/resource.ts';
import { Glyph } from '../visual/glyph.tsx';
import { useRereadOn } from '../world/use-world-data.ts';
import { CampaignOptionsForm } from './campaign-options.tsx';
import type { DmTableCommand } from './table-commands.ts';

/**
 * The table's settings (docs/adr/0075-book-interface.md §18): what is chosen once for a campaign
 * and seldom again — whose dice the table rolls (ADR 0044 §4) and the campaign's options (ADR
 * 0056 §3) — on a page of their own, apart from the evening on the Session's page. Each is as it
 * was there: the dice are the table's state, the options a command of the World Engine.
 */
export function TableSettingsSheet({
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
  const ids = useId();
  const [round, setRound] = useState(0);
  const load = useCallback((signal: AbortSignal) => api.get<LobbyResponse>('lobby', signal), [api]);
  const lobby = useResource('dm-table-settings', load);
  useRereadOn(revision + round, lobby.reread);
  const [failed, setFailed] = useState(false);
  // The campaign's dice as just chosen, shown at once until the table's state reads it back.
  const [dice, setDice] = useState<TableDice | null>(null);
  const readDice = lobby.resource.status === 'ready' ? lobby.resource.value.dice : null;
  useEffect(() => {
    if (dice !== null && readDice === dice) setDice(null);
  }, [dice, readDice]);
  if (!open) return null;
  if (lobby.resource.status !== 'ready') {
    return (
      <StatusPanel
        state={lobby.resource.status === 'error' ? 'error' : 'loading'}
        label={lobby.resource.status === 'error' ? lobby.resource.message : t('Reading the table…')}
        onRetry={lobby.retry}
      />
    );
  }
  const table = lobby.resource.value;
  const change = async (body: object): Promise<boolean> => {
    setFailed(false);
    try {
      // Scoped: the table's changes name the DM perspective, as the route's order asks.
      await api.post('lobby', body, AbortSignal.timeout(20_000), true);
      return true;
    } catch {
      setFailed(true);
      return false;
    } finally {
      setRound((value) => value + 1);
    }
  };
  return (
    <div className="session-sheet">
      <section className="tool-group" aria-labelledby={`${ids}-dice`}>
        <h3 id={`${ids}-dice`}>
          <Glyph name="roll" />
          {t('The table’s dice')}
        </h3>
        {/* The campaign's dice (ADR 0044 §4): the players' own, entered, or the app's. */}
        <label className="lobby-dice">
          <input
            type="checkbox"
            checked={(dice ?? table.dice) === 'physical'}
            onChange={(event) => {
              const next = event.target.checked ? 'physical' : 'app';
              setDice(next);
              void change({ dice: next }).then((done) => {
                if (!done) setDice(null);
              });
            }}
          />
          {t('Players roll their own dice and enter what they show')}
        </label>
        {failed && (
          <p role="alert" className="authoring-notice error">
            {t('The table could not be changed. Try again.')}
          </p>
        )}
      </section>
      {/* Mounted again for each set read back: a saved change becomes the form's start. */}
      <CampaignOptionsForm
        key={JSON.stringify(table.options)}
        options={table.options}
        locked={locked}
        onRun={onRun}
      />
    </div>
  );
}
