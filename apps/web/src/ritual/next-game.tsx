import { NEXT_GAME_NOTE_CHARS, type NextGame } from '@ltw/contracts';
import { useLanguage, useT } from '@ltw/ui';
import { useEffect, useId, useRef, useState, type SubmitEvent } from 'react';

import type { WorldApi } from '../api/client.ts';
import { nativeShell } from '../native/shell.ts';
import { useSignInKind } from '../session/sign-in-kind.ts';
import { Glyph } from '../visual/glyph.tsx';
import {
  fromLocalInput,
  msToNextDay,
  nextGameWords,
  readerLocale,
  toLocalInput,
} from './next-game-words.ts';

/**
 * The reader's "now" for counting days: it moves on at their midnight and when the page is looked
 * at again, so a screen left open overnight does not go on saying "tomorrow".
 */
function useToday(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const again = () => {
      setNow(new Date());
    };
    const timer = window.setTimeout(again, msToNextDay(now));
    const seen = () => {
      if (document.visibilityState === 'visible') again();
    };
    document.addEventListener('visibilitychange', seen);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', seen);
    };
  }, [now]);
  return now;
}

/**
 * When the table meets again (docs/adr/0071-memory-and-ritual.md §3): the day and the hour in the
 * reader's own time zone and how far off it is, then the DM's line on a line of its own, so a long
 * one never buries the date. `calendar` adds the way to save it as a calendar file — the reader's
 * own calendar then reminds them.
 */
export function NextGameLine({
  next,
  calendar,
  labelled = true,
  className = '',
}: {
  readonly next: NextGame;
  /** Where the calendar file is (`calendarHref`); none where a file cannot be saved. */
  readonly calendar?: string | null;
  /** False under a heading that already says what the date is. */
  readonly labelled?: boolean;
  readonly className?: string;
}) {
  const t = useT();
  const language = useLanguage();
  const when = nextGameWords(next, readerLocale(language), useToday());
  return (
    <p className={`next-game ${className}`.trimEnd()}>
      <Glyph name="day-counter" />
      <span>
        {labelled ? (
          <>
            <strong>{t('Next game:')}</strong> {when}
          </>
        ) : (
          <strong>{when}</strong>
        )}
        {next.note !== '' && (
          <>
            {' '}
            <span className="next-game-note">{next.note}</span>
          </>
        )}
      </span>
      {typeof calendar === 'string' && (
        // No `download`: a phone's browser then offers its own calendar instead of its files.
        <a className="button-link" href={calendar}>
          {t('Add to calendar')}
        </a>
      )}
    </p>
  );
}

/** The calendar file of a campaign's next game: inside the campaign, or from the account's hub. */
export const calendarHref = (campaignId: string, from: 'campaign' | 'account' = 'campaign') =>
  `/api/${from === 'account' ? 'account/' : ''}campaigns/${encodeURIComponent(campaignId)}/next-game.ics`;

/**
 * Whether this screen can save a calendar file: a browser signed in by its cookie (a link sends
 * it), not a native shell — it hands no files to the system until it says it can (ADR 0070).
 */
export function useCalendarFile(): boolean {
  return useSignInKind() === 'session' && nativeShell() === null;
}

type FormState = 'busy' | 'kept' | 'removed' | 'failed' | 'not-removed' | 'undated' | 'past' | null;

/** The DM sets, changes or takes away the next game's date, on the Session sheet. */
export function NextGameForm({
  api,
  next,
  onChanged,
}: {
  readonly api: WorldApi;
  readonly next: NextGame | null;
  /** The table's state was written: the sheet reads it again. */
  readonly onChanged: () => void;
}) {
  const t = useT();
  const ids = useId();
  const calendar = useCalendarFile();
  const [when, setWhen] = useState(next ? toLocalInput(next.at) : '');
  const [note, setNote] = useState(next?.note ?? '');
  const [state, setState] = useState<FormState>(null);
  const field = useRef<HTMLInputElement>(null);
  // Untouched fields follow the table's date (it may change on another of the DM's screens);
  // touched ones are the DM's draft, and a date taken away leaves them, to set it again.
  const touched = useRef(false);
  const at = next?.at ?? null;
  const kept = next?.note ?? null;
  useEffect(() => {
    if (touched.current || at === null) return;
    setWhen(toLocalInput(at));
    setNote(kept ?? '');
  }, [at, kept]);
  const write = async (nextGame: NextGame | null) => {
    if (state === 'busy') return;
    setState('busy');
    try {
      await api.post('lobby', { nextGame }, AbortSignal.timeout(20_000), true);
      touched.current = false;
      setState(nextGame === null ? 'removed' : 'kept');
    } catch {
      setState(nextGame === null ? 'not-removed' : 'failed');
    } finally {
      onChanged();
    }
  };
  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const chosen = fromLocalInput(when);
    // An evening already over is not a next game (the server's own limit, said before asking it).
    const wrong =
      chosen === null ? 'undated' : Date.parse(chosen) < Date.now() - 6 * 3_600_000 ? 'past' : null;
    if (chosen === null || wrong !== null) {
      setState(wrong);
      field.current?.focus();
      return;
    }
    void write({ at: chosen, note: note.trim() });
  };
  const invalid = state === 'undated' || state === 'past';
  return (
    <section className="tool-group next-game-tool" aria-labelledby={`${ids}-title`}>
      <h3 id={`${ids}-title`}>
        <Glyph name="day-counter" />
        {t('The next game')}
      </h3>
      {next ? (
        <NextGameLine
          next={next}
          labelled={false}
          calendar={calendar ? calendarHref(api.campaignId) : null}
        />
      ) : (
        <p className="muted">
          {t(
            'No date yet. Set one, and everyone sees it in the campaign and in their campaign list.',
          )}
        </p>
      )}
      <form className="hand-form" noValidate onSubmit={submit}>
        <label htmlFor={`${ids}-when`}>{t('Day and time')}</label>
        <input
          ref={field}
          id={`${ids}-when`}
          type="datetime-local"
          value={when}
          aria-invalid={invalid}
          aria-describedby={invalid ? `${ids}-wrong` : undefined}
          onChange={(event) => {
            touched.current = true;
            setWhen(event.target.value);
            if (invalid) setState(null);
          }}
        />
        {invalid && (
          <p id={`${ids}-wrong`} role="alert" className="account-field-error">
            {state === 'past'
              ? t('That time has already passed. Choose a later one.')
              : t('Choose the day and the time first.')}
          </p>
        )}
        <label htmlFor={`${ids}-note`}>{t('A note for everyone (optional)')}</label>
        <input
          id={`${ids}-note`}
          maxLength={NEXT_GAME_NOTE_CHARS}
          placeholder={t('At Grandma’s; bring snacks')}
          value={note}
          onChange={(event) => {
            touched.current = true;
            setNote(event.target.value);
          }}
        />
        <div className="action-row">
          {/* Not `disabled` while it writes: a disabled button drops the focus the DM was at. */}
          <button type="submit" className="primary-button" aria-disabled={state === 'busy'}>
            {next ? t('Change the date') : t('Set the date')}
          </button>
          {next && (
            <button type="button" aria-disabled={state === 'busy'} onClick={() => void write(null)}>
              {t('Remove the date')}
            </button>
          )}
        </div>
        <p role="status" className="muted evening-status">
          {state === 'kept'
            ? t('The date is set. Everyone at the table sees it.')
            : state === 'removed'
              ? t('The date is removed. Set it again if that was a slip.')
              : ''}
        </p>
        {(state === 'failed' || state === 'not-removed') && (
          <p role="alert" className="authoring-notice error">
            {state === 'failed'
              ? t('The date could not be set. Check the day and the time, then try again.')
              : t('The date could not be removed. Try again.')}
          </p>
        )}
      </form>
    </section>
  );
}
