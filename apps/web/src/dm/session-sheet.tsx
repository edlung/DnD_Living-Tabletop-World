import type {
  LobbyResponse,
  MembershipResponse,
  SessionListResponse,
  TableMode,
} from '@ltw/contracts';
import { StatusPanel, useT } from '@ltw/ui';
import { useCallback, useId, useState, type SubmitEvent } from 'react';

import type { WorldApi } from '../api/client.ts';
import { useResource } from '../api/resource.ts';
import { Field } from '../session/account-forms.tsx';
import { useSignInKind } from '../session/sign-in-kind.ts';
import { Glyph } from '../visual/glyph.tsx';
import { useRereadOn } from '../world/use-world-data.ts';
import type { DmTableCommand } from './table-commands.ts';

/**
 * A session at the table (docs/adr/0043-dm-screen.md §6), on the DM's Session sheet: who is here,
 * ready or absent; the session's start (at the table or online), its pause and its end — and at
 * the end, the table's screens unpaired and the seats of players without a login freed, then the
 * chapter to write. The start and the end are the World Engine's; the rest is the table's.
 */
export function SessionSheet({
  api,
  open,
  revision,
  locked,
  onRun,
  onWriteChapter,
}: {
  readonly api: WorldApi;
  readonly open: boolean;
  readonly revision: number;
  readonly locked: boolean;
  readonly onRun: (command: DmTableCommand) => void;
  readonly onWriteChapter: () => void;
}) {
  const t = useT();
  const ids = useId();
  const [round, setRound] = useState(0);
  const load = useCallback((signal: AbortSignal) => api.get<LobbyResponse>('lobby', signal), [api]);
  const lobby = useResource('dm-lobby', load);
  useRereadOn(revision + round, lobby.reread);
  const [failed, setFailed] = useState(false);
  // What the end did, and the chapter to write: shown once the session is gone.
  const [ended, setEnded] = useState<string | null>(null);
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
  const change = async (body: object) => {
    setFailed(false);
    try {
      // Scoped: the table's changes name the DM perspective, as the route's order asks.
      await api.post('lobby', body, AbortSignal.timeout(20_000), true);
    } catch {
      setFailed(true);
    } finally {
      setRound((value) => value + 1);
    }
  };
  return (
    <div className="session-sheet">
      {ended !== null && table.session === null && (
        <div className="tool-group session-ended" role="status">
          <p>
            {ended === '' ? t('The session is over.') : `${t('The session is over.')} ${ended}`}
          </p>
          <button type="button" className="primary-button" onClick={onWriteChapter}>
            <Glyph name="chronicle" />
            {t('Write the chapter')}
          </button>
        </div>
      )}
      {table.session === null ? (
        <StartForm
          api={api}
          locked={locked}
          onStart={(title, mode) => {
            setEnded(null);
            void change({ mode }).then(() => {
              onRun({ type: 'StartSession', title });
            });
          }}
        />
      ) : (
        <Running
          title={table.session.title}
          sessionId={table.session.sessionId}
          mode={table.mode}
          paused={table.paused}
          locked={locked}
          api={api}
          onPause={(paused) => void change({ paused })}
          onEnd={(sessionId) => {
            void change({ paused: false }).then(() => {
              onRun({ type: 'EndSession', sessionId });
            });
          }}
          onEnded={setEnded}
        />
      )}
      <section className="tool-group lobby" aria-labelledby={`${ids}-lobby`}>
        <h3 id={`${ids}-lobby`}>
          <Glyph name="party" />
          {t('At the table')}
        </h3>
        {table.characters.length === 0 ? (
          <p className="muted">{t('No characters are at the table yet.')}</p>
        ) : (
          <ul className="lobby-list">
            {table.characters.map((entry) => (
              <li key={entry.character.entityId} className="lobby-row">
                <strong>{entry.character.name}</strong>
                <span className={`presence-label ${entry.present ? 'present' : 'away'}`}>
                  {entry.present ? t('connected') : t('not connected')}
                </span>
                {table.session === null && entry.ready && (
                  <span className="status-pill">{t('Ready')}</span>
                )}
                <label className="lobby-absent">
                  <input
                    type="checkbox"
                    checked={entry.absent}
                    onChange={(event) => {
                      void change({
                        absent: {
                          characterId: entry.character.entityId,
                          absent: event.target.checked,
                        },
                      });
                    }}
                  />
                  {t('Absent: the DM plays or skips')}
                </label>
              </li>
            ))}
          </ul>
        )}
      </section>
      {failed && (
        <p role="alert" className="authoring-notice error">
          {t('The table could not be changed. Try again.')}
        </p>
      )}
    </div>
  );
}

function StartForm({
  api,
  locked,
  onStart,
}: {
  readonly api: WorldApi;
  readonly locked: boolean;
  readonly onStart: (title: string, mode: TableMode) => void;
}) {
  const t = useT();
  const ids = useId();
  const load = useCallback(
    (signal: AbortSignal) => api.get<SessionListResponse>('sessions', signal, false),
    [api],
  );
  const sessions = useResource('dm-sessions', load);
  const count = sessions.resource.status === 'ready' ? sessions.resource.value.sessions.length : 0;
  const [title, setTitle] = useState<string | null>(null);
  const [mode, setMode] = useState<TableMode>('table');
  const [attempted, setAttempted] = useState(false);
  const shown = title ?? t('Session {number}', { number: count + 1 });
  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAttempted(true);
    if (shown.trim() === '') return;
    onStart(shown.trim(), mode);
  };
  return (
    <section className="tool-group" aria-labelledby={`${ids}-title`}>
      <h3 id={`${ids}-title`}>
        <Glyph name="chapter" />
        {t('Start a session')}
      </h3>
      <form className="hand-form" noValidate onSubmit={submit}>
        <Field
          label={t('Title')}
          error={attempted && shown.trim() === '' ? t('Give it a title.') : null}
        >
          {(control) => (
            <input
              {...control}
              maxLength={200}
              value={shown}
              onChange={(event) => {
                setTitle(event.target.value);
              }}
            />
          )}
        </Field>
        <fieldset className="hand-choice">
          <legend>{t('Where you play')}</legend>
          {(['table', 'online'] as const).map((option) => (
            <label key={option}>
              <input
                type="radio"
                name={`${ids}-mode`}
                checked={mode === option}
                onChange={() => {
                  setMode(option);
                }}
              />
              {option === 'table' ? t('At the table') : t('Online')}
            </label>
          ))}
        </fieldset>
        <div className="action-row">
          <button type="submit" className="primary-button" disabled={locked}>
            <Glyph name="confirm" />
            {t('Start the session')}
          </button>
        </div>
      </form>
    </section>
  );
}

function Running({
  api,
  title,
  sessionId,
  mode,
  paused,
  locked,
  onPause,
  onEnd,
  onEnded,
}: {
  readonly api: WorldApi;
  readonly title: string;
  readonly sessionId: string;
  readonly mode: TableMode;
  readonly paused: boolean;
  readonly locked: boolean;
  readonly onPause: (paused: boolean) => void;
  readonly onEnd: (sessionId: string) => void;
  /** What the end did (the sheet shows it once the session is gone). */
  readonly onEnded: (done: string) => void;
}) {
  const t = useT();
  const ids = useId();
  const invitations = useSignInKind() === 'session';
  const [ending, setEnding] = useState(false);
  const [unpair, setUnpair] = useState(true);
  const [guests, setGuests] = useState(false);
  const end = async () => {
    const done: string[] = [];
    onEnd(sessionId);
    if (invitations && unpair) {
      await api.post('displays/revoke', {}, AbortSignal.timeout(20_000)).catch(() => undefined);
      done.push(t('The table’s screens are unpaired.'));
    }
    if (invitations && guests) {
      const members = await api
        .get<MembershipResponse>('invitations', AbortSignal.timeout(20_000), false)
        .catch(() => null);
      const free = members?.members.filter((member) => member.login === null) ?? [];
      for (const member of free) {
        await api
          .post(
            `members/${encodeURIComponent(member.characterId)}/revoke`,
            {},
            AbortSignal.timeout(20_000),
          )
          .catch(() => undefined);
      }
      done.push(t('Seats without a login are free: {count}.', { count: free.length }));
    }
    setEnding(false);
    onEnded(done.join(' '));
  };
  return (
    <section className="tool-group session-running" aria-labelledby={`${ids}-title`}>
      <h3 id={`${ids}-title`}>
        <Glyph name="chapter" />
        {title}
      </h3>
      <p className="muted">
        {mode === 'table' ? t('At the table') : t('Online')}
        {paused ? ` · ${t('Paused')}` : ''}
      </p>
      <div className="action-row">
        <button
          type="button"
          disabled={locked}
          onClick={() => {
            onPause(!paused);
          }}
        >
          <Glyph name={paused ? 'confirm' : 'time'} />
          {paused ? t('Resume the game') : t('Pause the game')}
        </button>
        <button
          type="button"
          aria-expanded={ending}
          onClick={() => {
            setEnding(!ending);
          }}
        >
          <Glyph name="leave" />
          {t('End the session')}
        </button>
      </div>
      {ending && (
        <div className="hand-form session-end">
          <p>{t('End “{title}” for everyone?', { title })}</p>
          {invitations && (
            <>
              <label>
                <input
                  type="checkbox"
                  checked={unpair}
                  onChange={(event) => {
                    setUnpair(event.target.checked);
                  }}
                />
                {t('Unpair the table’s screens')}
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={guests}
                  onChange={(event) => {
                    setGuests(event.target.checked);
                  }}
                />
                {t('Free the seats of players without a login')}
              </label>
            </>
          )}
          <div className="action-row">
            <button
              type="button"
              className="primary-button"
              disabled={locked}
              onClick={() => void end()}
            >
              {t('Yes, end the session')}
            </button>
            <button
              type="button"
              onClick={() => {
                setEnding(false);
              }}
            >
              {t('Keep playing')}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
