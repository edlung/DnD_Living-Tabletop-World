import type { LobbyResponse, SessionListResponse, TableMode } from '@ltw/contracts';
import { StatusPanel, useT } from '@ltw/ui';
import { useCallback, useEffect, useId, useRef, useState, type SubmitEvent } from 'react';

import type { WorldApi } from '../api/client.ts';
import { useResource } from '../api/resource.ts';
import { recapParagraphs } from '../chronicle/book-chapters.ts';
import { chapterMessage } from '../chronicle/chapter-message.ts';
import { usePreviously } from '../chronicle/previously.tsx';
import { AgreementTool } from '../ritual/agreement-tool.tsx';
import { CampaignEnd } from '../ritual/campaign-end.tsx';
import { useEnding } from '../ritual/ending.ts';
import { EveningWords } from '../ritual/evening-words.tsx';
import { NextGameForm } from '../ritual/next-game.tsx';
import { Field } from '../session/account-forms.tsx';
import { Glyph } from '../visual/glyph.tsx';
import { useRereadOn } from '../world/use-world-data.ts';
import { FirstEvening } from './first-evening.tsx';
import { STEP_WORDS, writeChapter, type EveningResult, type EveningStep } from './evening.ts';
import { MusicPanel } from './music-panel.tsx';
import { Running } from './session-running.tsx';
import { SoundChoice } from './sound-choice.tsx';
import type { DmTableCommand } from './table-commands.ts';
import { Pick, PickTiles } from '../book-kit/pick.tsx';

/**
 * A session at the table (docs/adr/0043-dm-screen.md §6), on the DM's Session sheet: the
 * session's start first (at the table or online, opened with "Previously…"), its pause and its
 * end — and at the end the evening closed (`session-running.tsx`,
 * docs/adr/0071-memory-and-ritual.md §1): its moments kept, the table's screens unpaired, guest
 * seats freed, the party's chapter written; then who is here, ready or absent. The start and the
 * end are the World Engine's; the rest is the table's. The page is the evening's: whose dice the
 * table rolls and the campaign's options are on the settings page (`table-settings-sheet.tsx`,
 * docs/adr/0075-book-interface.md §18).
 */
export function SessionSheet({
  api,
  open,
  revision,
  locked,
  locationId,
  onRun,
  onWorldChanged,
  onOpenChronicle,
}: {
  readonly api: WorldApi;
  readonly open: boolean;
  readonly revision: number;
  readonly locked: boolean;
  /** Where the DM looks; null when nowhere. */
  readonly locationId: string | null;
  readonly onRun: (command: DmTableCommand) => void;
  /** Commands sent from here changed the world: its views read again. */
  readonly onWorldChanged: () => void;
  /** Opens the book, at a chapter when one is named. */
  readonly onOpenChronicle: (chronicleId: string | null) => void;
}) {
  const t = useT();
  const ids = useId();
  const [round, setRound] = useState(0);
  const load = useCallback((signal: AbortSignal) => api.get<LobbyResponse>('lobby', signal), [api]);
  const lobby = useResource('dm-lobby', load);
  useRereadOn(revision + round, lobby.reread);
  // The adventure's end (ADR 0072 §2): finished, the campaign is read and has no next session.
  const end = useEnding(api, revision + round);
  const finished = (end.ending?.ending ?? null) !== null;
  const [failed, setFailed] = useState(false);
  // What the closing did: shown once the session is gone.
  const [ended, setEnded] = useState<EveningResult | null>(null);
  // The closing's step that runs: the session is gone from the table before its chapter is
  // written, so the sheet itself says what goes on.
  const [step, setStep] = useState<EveningStep | null>(null);
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
      {/* The session itself and its music, one column: the table's own controls beside it. */}
      <div className="session-main">
        {ended !== null && table.session === null && (
          <EveningClosed
            key={ended.sessionId}
            api={api}
            result={ended}
            onOpenChronicle={onOpenChronicle}
          />
        )}
        {table.session === null && step !== null ? (
          <div className="tool-group session-closing">
            <p role="status" className="book-writing">
              {t(STEP_WORDS[step])}
            </p>
          </div>
        ) : table.session === null && finished ? null : table.session === null ? (
          <StartForm
            api={api}
            locked={locked}
            revision={revision + round}
            onStart={(title, mode, previously) => {
              setEnded(null);
              void (async () => {
                // The recap is cast first: a screen that goes online with the session opens with
                // it. A cast that fails does not hold the session back; the sheet says so.
                const cast = previously
                  ? await api
                      .post(
                        'display/cast',
                        { cast: { kind: 'chronicle' } },
                        AbortSignal.timeout(20_000),
                      )
                      .then(
                        () => true,
                        () => false,
                      )
                  : true;
                // The game that was dated begins: its date has done its work (one for a later
                // day stays). Read now: a date just changed may not have come back to the sheet.
                const dated = await api
                  .get<LobbyResponse>('lobby', AbortSignal.timeout(20_000))
                  .then((now) => now.nextGame ?? null)
                  .catch(() => table.nextGame ?? null);
                const begun = dated && Date.parse(dated.at) <= Date.now() + 12 * 3_600_000;
                await change(begun ? { mode, nextGame: null } : { mode });
                if (!cast) setFailed(true);
                onRun({ type: 'StartSession', title });
              })();
            }}
          />
        ) : (
          <Running
            title={table.session.title}
            sessionId={table.session.sessionId}
            mode={table.mode}
            paused={table.paused}
            locked={locked}
            revision={revision + round}
            locationId={locationId}
            api={api}
            step={step}
            onPause={(paused) => void change({ paused })}
            onStep={setStep}
            onClosed={(result) => {
              setStep(null);
              if (result.stopped === null) setEnded(result);
              setRound((value) => value + 1);
              onWorldChanged();
            }}
          />
        )}
        {/* Until the first evening has ended (a campaign may begin with its session open). */}
        {step === null && (
          <FirstEvening api={api} revision={revision + round} dated={Boolean(table.nextGame)} />
        )}
        {table.session === null && step === null && (
          <EveningWords
            api={api}
            revision={revision + round}
            characters={table.characters.map((entry) => entry.character)}
          />
        )}
        {/* When the table meets again (ADR 0071 §3). */}
        {!finished && (
          <NextGameForm
            api={api}
            next={table.nextGame ?? null}
            characters={table.characters}
            onChanged={() => {
              setRound((value) => value + 1);
            }}
          />
        )}
        {end.ending !== null && step === null && (
          <CampaignEnd
            api={api}
            ending={end.ending}
            sessionOpen={table.session !== null}
            onChanged={() => {
              setRound((value) => value + 1);
            }}
          />
        )}
        {/* How this table plays (ADR 0071 §4). */}
        <AgreementTool api={api} revision={revision + round} />
        {/* The DM's music (ADR 0059 §3): where the ambience plays, from the same moment. */}
        <MusicPanel
          api={api}
          revision={revision + round}
          music={table.sound.music}
          onChange={(music) => change({ music })}
        />
      </div>
      <section className="tool-group lobby" aria-labelledby={`${ids}-lobby`}>
        <h3 id={`${ids}-lobby`}>
          <Glyph name="party" />
          {t('At the table')}
        </h3>
        {/* What the table hears (ADR 0059 §1): on the table's screen and, online, everywhere. */}
        <SoundChoice
          api={api}
          revision={revision + round}
          current={table.sound.ambience}
          onChoose={(ambience) => change({ ambience })}
        />
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

/**
 * What closing the evening did, said once the session is gone: it takes focus (the button that
 * closed the evening went with the session), and says what to do about the chapter.
 */
function EveningClosed({
  api,
  result,
  onOpenChronicle,
}: {
  readonly api: WorldApi;
  readonly result: EveningResult;
  readonly onOpenChronicle: (chronicleId: string | null) => void;
}) {
  const t = useT();
  const head = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    head.current?.focus();
  }, []);
  // The chapter as it stands: the closing's, or a later try's.
  const [chapter, setChapter] = useState(result.chapter);
  const [trying, setTrying] = useState(false);
  const again = async () => {
    setTrying(true);
    setChapter(await writeChapter(api, result, (written) => chapterMessage(written)));
    setTrying(false);
  };
  return (
    <div className="tool-group session-ended">
      <p ref={head} tabIndex={-1}>
        {t('The session is over.')}
      </p>
      <ul className="evening-done">
        {result.kept > 0 && <li>{t('Moments kept: {count}.', { count: result.kept })}</li>}
        {result.refused.map((words) => (
          <li key={words}>{t('Not kept — the game did not accept it: “{words}”', { words })}</li>
        ))}
        {result.unpaired && <li>{t('The table’s screens are unpaired.')}</li>}
        {result.freed !== null && (
          <li>{t('Seats without a login are free: {count}.', { count: result.freed })}</li>
        )}
      </ul>
      <p role="status">
        {trying
          ? t(STEP_WORDS.chapter)
          : chapter.kind === 'written'
            ? `${t(chapter.prose)} ${t('Players can read it in the Chronicle. Next time, start with “Previously…”.')}`
            : chapter.kind === 'nothing'
              ? t(
                  'No chapter this time: the party kept no memories of this session. Next time, tick a moment or add a line of your own before you end.',
                )
              : chapter.kind === 'failed'
                ? t(
                    'The chapter could not be written. Try again, or write it later in the Chronicle (“Write a chapter (DM)”).',
                  )
                : ''}
      </p>
      {chapter.kind === 'written' && (
        <button
          type="button"
          className="primary-button"
          onClick={() => {
            onOpenChronicle(chapter.chronicleId);
          }}
        >
          <Glyph name="chronicle" />
          {t('Open the chapter')}
        </button>
      )}
      {chapter.kind === 'failed' && (
        <button
          type="button"
          className="primary-button"
          disabled={trying}
          onClick={() => void again()}
        >
          <Glyph name="chapter" />
          {t('Try the chapter again')}
        </button>
      )}
      {chapter.kind === 'skipped' && (
        <button
          type="button"
          onClick={() => {
            onOpenChronicle(null);
          }}
        >
          <Glyph name="chronicle" />
          {t('Write the chapter')}
        </button>
      )}
    </div>
  );
}

function StartForm({
  api,
  locked,
  revision,
  onStart,
}: {
  readonly api: WorldApi;
  readonly locked: boolean;
  readonly revision: number;
  /** `previously`: the table's screen opens with the recap. */
  readonly onStart: (title: string, mode: TableMode, previously: boolean) => void;
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
  const previously = usePreviously(api, true, revision);
  const [recap, setRecap] = useState(true);
  const shown = title ?? t('Session {number}', { number: count + 1 });
  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAttempted(true);
    if (shown.trim() === '') return;
    onStart(shown.trim(), mode, recap && previously.chapter !== null);
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
        <PickTiles
          legend={t('Where you play')}
          name={`${ids}-mode`}
          value={mode}
          options={[
            { value: 'table', label: t('At the table'), pick: 'table' },
            { value: 'online', label: t('Online'), pick: 'online' },
          ]}
          onChange={setMode}
        />
        {previously.chapter !== null && (
          <>
            <label className="session-recap-choice">
              <input
                type="checkbox"
                checked={recap}
                onChange={(event) => {
                  setRecap(event.target.checked);
                }}
              />
              {t('Open with “Previously…” on the table’s screen')}
            </label>
            {/* In brief, so the start stays in view: the whole of it is read from the session's
                panel once it runs. */}
            {recap && (
              <div className="previously-brief previously-brief--form">
                <p className="previously-brief-title">{previously.chapter.title}</p>
                <p className="previously-brief-opening">
                  {recapParagraphs(previously.chapter).at(-1) ?? ''}
                </p>
              </div>
            )}
          </>
        )}
        <div className="action-row">
          <button type="submit" className="primary-button" disabled={locked}>
            <Pick name="evening" />
            {t('Start the session')}
          </button>
        </div>
      </form>
    </section>
  );
}
