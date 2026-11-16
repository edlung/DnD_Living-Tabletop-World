import type { Cast, CastResponse, DisplayListResponse, LobbyResponse } from '@ltw/contracts';
import { useT } from '@ltw/ui';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { WorldApi } from '../api/client.ts';
import { useResource } from '../api/resource.ts';
import { BREAK_AFTER, changeDiceSettings, useDiceSettings } from '../dice/settings.ts';
import { Glyph } from '../visual/glyph.tsx';
import {
  advance,
  askLater,
  breakBegun,
  breakDue,
  breakOver,
  minutesPlayed,
  readBreak,
  TICK_MS,
  writeBreak,
  type BreakState,
} from './break-timer.ts';

const SCENE: Cast = { kind: 'scene', locationId: null };
const wait = () => AbortSignal.timeout(20_000);
/** How long the card's last word stays once the card has gone. */
const SAID_MS = 8_000;

/**
 * The DM's break reminder (docs/adr/0072-keepsakes.md §3), among the table's questions over the
 * stage: after the minutes of play the DM asked for, a quiet card offers a break. Taking it pauses
 * the game — that is the break — and shows a "Break" title card on the table's screens (the
 * `title` cast that exists: ADR 0042 §3) where there are screens to tell; the card says which
 * happened. The break lasts while the game is paused: "Back to the game", or resuming from the
 * Session sheet, ends it and shows again what the screens showed before. Off unless the DM turns
 * it on (`BreakChoice`, on the Session sheet); the count is this browser's own.
 */
export function BreakReminder({ api }: { readonly api: WorldApi }) {
  const t = useT();
  const after = useDiceSettings().breakAfter;
  const [state, setState] = useState<BreakState | null>(() => readBreak(api.campaignId));
  const kept = useRef(state);
  const keep = useCallback(
    (next: BreakState | null) => {
      kept.current = next;
      writeBreak(api.campaignId, next);
      setState(next);
    },
    [api],
  );
  // The table is read only while the reminder is on, or a break it called still is.
  const watching = after !== 0 || state?.onBreak === true;
  const load = useCallback(
    (signal: AbortSignal) =>
      watching ? api.get<LobbyResponse>('lobby', signal).catch(() => null) : Promise.resolve(null),
    [api, watching],
  );
  const lobby = useResource(`break-lobby:${String(watching)}`, load);
  const table = lobby.resource.status === 'ready' ? lobby.resource.value : null;
  const sessionId = table?.session?.sessionId ?? null;
  const paused = table?.paused ?? false;
  const online = table?.mode === 'online';
  const known = table !== null;
  // The card's last word, said where the card was: it stays a moment and takes the focus the
  // card's button held.
  const [said, setSaid] = useState<string | null>(null);
  const word = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (said === null) return;
    word.current?.focus();
    const timer = window.setTimeout(() => {
      setSaid(null);
    }, SAID_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, [said]);
  const breakTitle = t('Break');
  /** The screens go back to what they showed, if they still say "Break". */
  const showAgain = useCallback(
    async (resume: Cast | null) => {
      if (resume === null) return;
      const now = await api
        .get<CastResponse>('display/cast', wait(), false)
        .then((read) => read.cast)
        .catch(() => null);
      // Whatever the DM has cast since stays.
      if (now?.kind !== 'title' || now.title !== breakTitle) return;
      await api.post('display/cast', { cast: resume }, wait()).catch(() => undefined);
    },
    [api, breakTitle],
  );
  const back = t('The game is on again.');
  useEffect(() => {
    if (!known) return;
    const look = () => {
      const before = kept.current;
      const next = advance(before, { sessionId, paused, now: Date.now() });
      keep(next);
      // Resumed from the Session sheet: the break is over all the same.
      if (before?.onBreak === true && next?.onBreak === false) {
        void showAgain(before.resume);
        setSaid(back);
      }
    };
    look();
    const timer = window.setInterval(look, TICK_MS);
    return () => {
      window.clearInterval(timer);
    };
  }, [known, sessionId, paused, keep, showAgain, back]);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const card = useRef<HTMLElement>(null);
  const change = (work: () => Promise<BreakState>, done?: string) => {
    setBusy(true);
    setFailed(false);
    void work()
      .then(
        (next) => {
          keep(next);
          if (done !== undefined) setSaid(done);
          // The button pressed is gone or changed: the card keeps the focus while it stays.
          else card.current?.focus();
        },
        () => {
          setFailed(true);
        },
      )
      .finally(() => {
        setBusy(false);
        lobby.reread();
      });
  };
  const last =
    said === null ? null : (
      <p ref={word} tabIndex={-1} className="rest-banner break-said">
        <Glyph name="confirm" />
        <span className="rest-banner-text">{said}</span>
      </p>
    );
  if (state === null || !known) return last;
  if (state.onBreak) {
    return (
      <section ref={card} tabIndex={-1} className="rest-banner break-card" aria-label={t('Break')}>
        <p className="asked-check-what">
          <Glyph name="time" />
          <span className="rest-banner-text">
            {state.shown
              ? t('A break. The game is paused, and the table’s screens say “Break”.')
              : t('A break. The game is paused.')}
          </span>
        </p>
        <button
          type="button"
          className="primary-button"
          disabled={busy}
          onClick={() => {
            change(async () => {
              await api.post('lobby', { paused: false }, wait(), true);
              await showAgain(state.resume);
              return breakOver(state, Date.now());
            }, back);
          }}
        >
          {t('Back to the game')}
        </button>
        {failed && <Failed />}
      </section>
    );
  }
  if (!breakDue(state, after)) return last;
  return (
    <section
      ref={card}
      tabIndex={-1}
      className="rest-banner break-card"
      aria-label={t('Time for a break?')}
    >
      <p className="asked-check-what">
        <Glyph name="time" />
        <span className="rest-banner-text">
          {t('{minutes} minutes at the table. Time for a break?', {
            minutes: minutesPlayed(state),
          })}
        </span>
      </p>
      <div className="action-row">
        <button
          type="button"
          className="primary-button"
          disabled={busy}
          onClick={() => {
            change(async () => {
              // What the screens show now comes back after the break.
              const shown = await api
                .get<CastResponse>('display/cast', wait(), false)
                .then((read) => read.cast)
                .catch(() => null);
              await api.post('lobby', { paused: true }, wait(), true);
              // The pause is the break; the screens are told where there are any to tell.
              const told = await api
                .post(
                  'display/cast',
                  {
                    cast: {
                      kind: 'title',
                      title: breakTitle,
                      subtitle: t('We will be back at the table soon.'),
                    },
                  },
                  wait(),
                )
                .then(
                  () => true,
                  () => false,
                );
              // A screen says so only where one is there: a paired TV, or every screen online.
              const paired =
                told &&
                !online &&
                (await api
                  .get<DisplayListResponse>('displays', wait(), false)
                  .then((read) => read.displays.length > 0)
                  .catch(() => false));
              const before = shown === null || shown.kind === 'title' ? SCENE : shown;
              return breakBegun(
                state,
                { shown: told && (online || paired), resume: told ? before : null },
                Date.now(),
              );
            });
          }}
        >
          {t('Take a break')}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            keep(askLater(state));
            setSaid(t('I’ll ask again in 15 minutes.'));
          }}
        >
          {t('Ask again in 15 minutes')}
        </button>
      </div>
      {failed && <Failed />}
    </section>
  );
}

function Failed() {
  const t = useT();
  return (
    <p role="alert" className="authoring-notice error">
      {t('The table could not be changed. Try again.')}
    </p>
  );
}

const AFTER_WORDS: Readonly<Record<(typeof BREAK_AFTER)[number], string>> = {
  0: 'Don’t remind me',
  60: 'After 60 minutes of play',
  90: 'After 90 minutes of play',
};

/** The DM's choice of when to be reminded, on the Session sheet. Kept in this browser. */
export function BreakChoice({ id }: { readonly id: string }) {
  const t = useT();
  const after = useDiceSettings().breakAfter;
  return (
    <div className="break-choice">
      <label htmlFor={id}>{t('Remind me to take a break')}</label>
      <select
        id={id}
        value={after}
        aria-describedby={`${id}-how`}
        onChange={(event) => {
          const chosen = BREAK_AFTER.find((one) => one === Number(event.target.value));
          changeDiceSettings({ breakAfter: chosen ?? 0 });
        }}
      >
        {BREAK_AFTER.map((one) => (
          <option key={one} value={one}>
            {t(AFTER_WORDS[one])}
          </option>
        ))}
      </select>
      <p id={`${id}-how`} className="muted">
        {t(
          'When the time comes, a quiet card on this screen asks. If you take the break, the game is paused and the table’s screens show “Break”. Only this device remembers the choice.',
        )}
      </p>
    </div>
  );
}
