import type { DmHistoryEntry, EntityRef } from '@ltw/contracts';
import { StatusPanel, useT } from '@ltw/ui';
import { useEffect, useId, useMemo, useState } from 'react';

import type { WorldApi } from '../api/client.ts';
import { useResource } from '../api/resource.ts';
import { Glyph } from '../visual/glyph.tsx';
import { historyPageKey, historyPageLoader, PageCursor } from './history-pages.ts';
import { entryDetails, entryStatus, entryTitle, isPictureHold, STEP_TEXT } from './history-text.ts';
import { useHistoryUndo } from './use-history-undo.ts';

type Actions = ReturnType<typeof useHistoryUndo>;

const KIND_GLYPH = {
  authoring: 'add-character',
  substitution: 'perform',
  time: 'time',
  weather: 'weather',
} as const;

const UNDO_LABEL: Readonly<Record<DmHistoryEntry['kind'], string>> = {
  authoring: 'Undo this addition',
  substitution: 'Undo this action',
  world: 'Undo this change',
};

/**
 * The DM history with its undo (docs/adr/0033-live-session.md §7; replaces the screen-local
 * undo of ADR 0029 §8), in the History sheet. Read from the server in the DM perspective only,
 * and only while the sheet is open, so it survives a reload; the world screen remounts on a
 * perspective change, which drops every row. Pages follow the live signal in the background;
 * each older page is read from the cursor of the page above it, so nothing is skipped or
 * repeated when new entries arrive, and is known by its place, so a moved cursor neither empties
 * it nor closes the pages opened below it (`history-pages.ts`).
 */
export function DmHistory({
  api,
  open,
  directory,
  onWorldChanged,
  onAuthoringUndone,
}: {
  readonly api: WorldApi;
  /** The History sheet is open: the history is read, and followed, only meanwhile. */
  readonly open: boolean;
  readonly directory: readonly EntityRef[];
  readonly onWorldChanged: () => void;
  readonly onAuthoringUndone: (proposalId: string) => void;
}) {
  const t = useT();
  const [round, setRound] = useState(0);
  const actions = useHistoryUndo(api, (undone) => {
    setRound((value) => value + 1);
    onWorldChanged();
    if (undone?.kind === 'authoring') onAuthoringUndone(undone.proposalId);
  });
  const notice = actions.notice;
  return (
    <div className="dm-history">
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
            index={0}
            before={null}
            round={round}
            directory={directory}
            actions={actions}
          />
        </section>
      )}
    </div>
  );
}

function HistoryPage({
  api,
  index,
  before,
  round,
  directory,
  actions,
}: {
  readonly api: WorldApi;
  readonly index: number;
  readonly before: number | null;
  readonly round: number;
  readonly directory: readonly EntityRef[];
  readonly actions: Actions;
}) {
  const t = useT();
  const [older, setOlder] = useState(false);
  const [cursor] = useState(() => new PageCursor(before));
  const load = useMemo(() => historyPageLoader(api, cursor), [api, cursor]);
  const { resource, retry, reread } = useResource(historyPageKey(index), load);
  // A new entry above moves the cursor, and an undo changes what every shown page says: either
  // way the page is read again in the background, keeping its rows meanwhile. `reread` reaches
  // the current generation through a ref, so only `before` and `round` ask for it.
  useEffect(() => {
    if (cursor.follow(before)) reread();
  }, [before]);
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
          {t(
            'Nothing yet: authoring commits, actions taken for players, and time and weather changes appear here.',
          )}
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
            index={index + 1}
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

export function HistoryEntry({
  entry,
  directory,
  actions,
}: {
  readonly entry: DmHistoryEntry;
  readonly directory: readonly EntityRef[];
  readonly actions: Actions;
}) {
  const t = useT();
  const ids = useId();
  const step = (type: keyof typeof STEP_TEXT) => t(STEP_TEXT[type]);
  const { undo } = entry;
  // The preview says the world refuses this undo now: Undo stays, disabled, its reason said.
  const blockers = undo && !undo.possible ? undo.blockers : [];
  const reason =
    undo && !undo.possible
      ? [`${ids}-reason`, ...blockers.map((_, index) => `${ids}-step-${String(index)}`)].join(' ')
      : undefined;
  return (
    <li className={`dm-history-entry dm-history-entry--${entry.status.toLowerCase()}`}>
      <Glyph
        name={KIND_GLYPH[entry.kind === 'world' ? entry.change.kind : entry.kind]}
        className="history-kind"
      />
      <div className="history-body">
        <div className="section-heading">
          <strong>{entryTitle(t, entry, directory)}</strong>
          <span className="status-pill">{entryStatus(t, entry)}</span>
        </div>
        <p className="history-when">
          <Glyph name="time" />
          {entryDetails(t, entry)}
        </p>
        {undo?.possible && (
          <p className="history-undo-preview">
            <Glyph name="undo" />
            {t('Undo is possible now: the world allows it.')}
          </p>
        )}
        {undo && (
          <div className="action-row">
            <button
              disabled={actions.busy || !undo.possible}
              aria-describedby={reason}
              onClick={() => {
                void actions.undo(entry);
              }}
            >
              <Glyph name="undo" />
              {t(UNDO_LABEL[entry.kind])}
            </button>
          </div>
        )}
        {undo && !undo.possible && blockers.length === 0 && (
          <p id={`${ids}-reason`} className="muted">
            {t('This cannot be undone now.')}
          </p>
        )}
        {undo && !undo.possible && blockers.length > 0 && (
          <div role="group" aria-label={t('Undo blockers')} className="issue-list">
            <strong id={`${ids}-reason`}>
              {t('Undo is blocked by later steps that depend on this:')}
            </strong>
            <ul>
              {blockers.map((blocker, index) => (
                <li key={blocker.commandId}>
                  <span id={`${ids}-step-${String(index)}`}>{step(blocker.commandType)}</span>{' '}
                  {isPictureHold(blocker.commandType) ? (
                    <span className="muted">
                      {t(
                        'A picture made for this holds it: discard that picture under Images, then undo again.',
                      )}
                    </span>
                  ) : (
                    <button
                      disabled={actions.busy}
                      onClick={() => {
                        void actions.undoBlocker(blocker.commandId);
                      }}
                    >
                      {t('Undo “{step}” first', { step: step(blocker.commandType) })}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </li>
  );
}
