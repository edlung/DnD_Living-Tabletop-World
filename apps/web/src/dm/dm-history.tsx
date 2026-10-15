import type { DmHistoryEntry, DmHistoryResponse, EntityRef } from '@ltw/contracts';
import { StatusPanel, useT } from '@ltw/ui';
import { useCallback, useEffect, useState } from 'react';

import type { WorldApi } from '../api/client.ts';
import { useResource } from '../api/resource.ts';
import { entryDetails, entryStatus, entryTitle, STEP_TEXT } from './history-text.ts';
import { useHistoryUndo } from './use-history-undo.ts';

type Actions = ReturnType<typeof useHistoryUndo>;

/**
 * The DM history with its undo (docs/adr/0033-live-session.md §7; replaces the screen-local
 * undo of ADR 0029 §8). Read from the server in the DM perspective only, so it survives a
 * reload; the world screen remounts on a perspective change, which drops every row. Pages
 * follow the live signal in the background; each older page is read from the cursor of the
 * page above it, so nothing is skipped or repeated when new entries arrive.
 */
export function DmHistory({
  api,
  directory,
  onWorldChanged,
  onAuthoringUndone,
}: {
  readonly api: WorldApi;
  readonly directory: readonly EntityRef[];
  readonly onWorldChanged: () => void;
  readonly onAuthoringUndone: (proposalId: string) => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [round, setRound] = useState(0);
  const actions = useHistoryUndo(api, (undone) => {
    setRound((value) => value + 1);
    onWorldChanged();
    if (undone?.kind === 'authoring') onAuthoringUndone(undone.proposalId);
  });
  const notice = actions.notice;
  return (
    <details
      className="disclosure dm-history"
      open={open}
      onToggle={(event) => {
        setOpen(event.currentTarget.open);
      }}
    >
      <summary>{t('History and undo (DM)')}</summary>
      {notice && (
        <p
          role={notice.kind === 'error' ? 'alert' : 'status'}
          className={`authoring-notice ${notice.kind}`}
        >
          {t(notice.text)}
        </p>
      )}
      {open && (
        <section aria-label={t('DM history')}>
          <HistoryPage
            api={api}
            before={null}
            round={round}
            directory={directory}
            actions={actions}
          />
        </section>
      )}
    </details>
  );
}

function HistoryPage({
  api,
  before,
  round,
  directory,
  actions,
}: {
  readonly api: WorldApi;
  readonly before: number | null;
  readonly round: number;
  readonly directory: readonly EntityRef[];
  readonly actions: Actions;
}) {
  const t = useT();
  const [older, setOlder] = useState(false);
  const load = useCallback(
    (signal: AbortSignal) =>
      api.get<DmHistoryResponse>(
        'dm/history',
        signal,
        true,
        before === null ? undefined : { before: String(before) },
      ),
    [api, before],
  );
  const { resource, retry, reread } = useResource(`dm-history:${String(before)}`, load);
  // After an undo every shown page is read again, keeping its rows meanwhile. `reread`
  // reaches the current generation through a ref, so only `round` asks for it.
  useEffect(() => {
    if (round > 0) reread();
  }, [round]);
  if (resource.status !== 'ready') {
    return (
      <StatusPanel
        state={resource.status}
        label={resource.status === 'error' ? resource.message : t('Reading the history…')}
        onRetry={retry}
      />
    );
  }
  const { entries, nextBefore } = resource.value;
  return (
    <>
      {before === null && entries.length === 0 && (
        <p className="muted">
          {t('Nothing yet: authoring commits and actions taken for players appear here.')}
        </p>
      )}
      <ol className="dm-history-list">
        {entries.map((entry) => (
          <HistoryEntry
            key={entry.commandId}
            entry={entry}
            directory={directory}
            actions={actions}
          />
        ))}
      </ol>
      {nextBefore !== null &&
        (older ? (
          <HistoryPage
            api={api}
            before={nextBefore}
            round={round}
            directory={directory}
            actions={actions}
          />
        ) : (
          <button
            className="quiet-button"
            onClick={() => {
              setOlder(true);
            }}
          >
            {t('Show older')}
          </button>
        ))}
    </>
  );
}

function HistoryEntry({
  entry,
  directory,
  actions,
}: {
  readonly entry: DmHistoryEntry;
  readonly directory: readonly EntityRef[];
  readonly actions: Actions;
}) {
  const t = useT();
  const step = (type: keyof typeof STEP_TEXT) => t(STEP_TEXT[type]);
  const { undo } = entry;
  return (
    <li className="dm-history-entry">
      <div className="section-heading">
        <strong>{entryTitle(t, entry, directory)}</strong>
        <span className="status-pill">{entryStatus(t, entry)}</span>
      </div>
      <p className="muted">{entryDetails(t, entry)}</p>
      {undo && (
        <div className="action-row">
          <button
            disabled={actions.busy}
            onClick={() => {
              void actions.undo(entry);
            }}
          >
            {entry.kind === 'authoring' ? t('Undo this addition') : t('Undo this action')}
          </button>
        </div>
      )}
      {undo && !undo.possible && undo.blockers.length === 0 && (
        <p className="muted">{t('This cannot be undone now.')}</p>
      )}
      {undo && !undo.possible && undo.blockers.length > 0 && (
        <div role="group" aria-label={t('Undo blockers')} className="issue-list">
          <strong>{t('Undo is blocked by later steps that depend on this:')}</strong>
          <ul>
            {undo.blockers.map((blocker) => (
              <li key={blocker.commandId}>
                {step(blocker.commandType)}{' '}
                <button
                  disabled={actions.busy}
                  onClick={() => {
                    void actions.undoBlocker(blocker.commandId);
                  }}
                >
                  {t('Undo “{step}” first', { step: step(blocker.commandType) })}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </li>
  );
}
