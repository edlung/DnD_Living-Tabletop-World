import type {
  MemorySuggestionsResponse,
  ScenePresentationResponse,
  SessionListResponse,
} from '@ltw/contracts';
import { useT } from '@ltw/ui';
import { useCallback, useId, useRef, useState } from 'react';

import type { WorldApi } from '../api/client.ts';
import { useResource } from '../api/resource.ts';
import { chapterMessage } from '../chronicle/chapter-message.ts';
import { useSignInKind } from '../session/sign-in-kind.ts';
import { useRereadOn } from '../world/use-world-data.ts';
import {
  KICKERS,
  STEP_WORDS,
  closeEvening,
  momentWords,
  type EveningResult,
  type EveningStep,
} from './evening.ts';

/**
 * Closing the evening (docs/adr/0071-memory-and-ritual.md §1.3), under "End the session": the
 * moments the game suggests for this session, each kept or not, and a line of the DM's own; what
 * happens when the session ends (the party's chapter, and on real sign-in the screens and guest
 * seats); then the end itself. The steps run in `evening.ts`; the sheet above says how they go.
 */
export function CloseEvening({
  api,
  title,
  sessionId,
  locked,
  revision,
  locationId,
  step,
  onStep,
  onKeepPlaying,
  onClosed,
}: {
  readonly api: WorldApi;
  readonly title: string;
  readonly sessionId: string;
  readonly locked: boolean;
  readonly revision: number;
  readonly locationId: string | null;
  readonly step: EveningStep | null;
  readonly onStep: (step: EveningStep) => void;
  readonly onKeepPlaying: () => void;
  readonly onClosed: (result: EveningResult) => void;
}) {
  const t = useT();
  const ids = useId();
  const invitations = useSignInKind() === 'session';
  const loadSessions = useCallback(
    (signal: AbortSignal) => api.get<SessionListResponse>('sessions', signal, false),
    [api],
  );
  const sessions = useResource('closing-sessions', loadSessions);
  const startedAt =
    sessions.resource.status === 'ready'
      ? (sessions.resource.value.sessions.find((entry) => entry.sessionId === sessionId)
          ?.startedAt ?? null)
      : null;
  const loadMoments = useCallback(
    (signal: AbortSignal) =>
      startedAt === null
        ? Promise.resolve(null)
        : api.get<MemorySuggestionsResponse>('chronicle/suggestions', signal, false, {
            scope: 'PARTY',
            from: String(startedAt),
            session: sessionId,
          }),
    [api, startedAt, sessionId],
  );
  const moments = useResource(`closing-moments:${String(startedAt)}`, loadMoments);
  useRereadOn(revision, moments.reread);
  const loadScene = useCallback(
    (signal: AbortSignal) =>
      locationId === null
        ? Promise.resolve(null)
        : api.get<ScenePresentationResponse>(
            `locations/${encodeURIComponent(locationId)}/scene`,
            signal,
          ),
    [api, locationId],
  );
  const scene = useResource(`closing-scene:${locationId ?? ''}`, loadScene);
  useRereadOn(revision, scene.reread);

  const suggestions =
    moments.resource.status === 'ready' ? (moments.resource.value?.suggestions ?? []) : [];
  const [dropped, setDropped] = useState<ReadonlySet<string>>(new Set());
  const [line, setLine] = useState('');
  const [chapter, setChapter] = useState(true);
  const [stars, setStars] = useState(true);
  // The screens stay paired by default: they show the stars now and "Previously…" next time.
  const [unpair, setUnpair] = useState(false);
  const [guests, setGuests] = useState(false);
  const [busy, setBusy] = useState(false);
  const [stopped, setStopped] = useState<EveningResult | null>(null);
  // One ID for each command of this closing: pressing again repeats nothing that was done.
  const commandIds = useRef(new Map<string, string>());
  const commandId = (key: string) => {
    const known = commandIds.current.get(key);
    if (known) return known;
    const made = `evening-${crypto.randomUUID()}`;
    commandIds.current.set(key, made);
    return made;
  };
  // The world's time for the DM's own line: the scene's, else the latest moment's or the start.
  const now =
    scene.resource.status === 'ready' && scene.resource.value
      ? scene.resource.value.worldTime
      : Math.max(startedAt ?? 0, ...suggestions.map((entry) => entry.occurredAt));
  const reading = sessions.resource.status === 'loading' || moments.resource.status === 'loading';
  const unread = sessions.resource.status === 'error' || moments.resource.status === 'error';

  const close = async () => {
    setBusy(true);
    setStopped(null);
    const result = await closeEvening(
      api,
      {
        sessionId,
        title,
        kept: suggestions.filter((entry) => !dropped.has(entry.suggestionId)),
        line,
        now,
        reason: t('The DM’s line at the end of the session'),
        chapter,
        stars,
        unpair: invitations && unpair,
        guests: invitations && guests,
        commandId,
      },
      (written) => chapterMessage(written),
      onStep,
    );
    setBusy(false);
    if (result.stopped !== null) setStopped(result);
    onClosed(result);
  };

  return (
    <div className="hand-form session-end">
      <p>{t('End “{title}” for everyone?', { title })}</p>
      <fieldset className="evening-moments" disabled={busy}>
        <legend>{t('The evening’s moments')}</legend>
        {reading ? (
          <p role="status" className="muted">
            {t('Reading the evening’s moments…')}
          </p>
        ) : unread ? (
          <p className="muted">
            {t('The evening’s moments could not be read. You can still end the session.')}
          </p>
        ) : suggestions.length === 0 ? (
          <p className="muted">
            {t('Nothing new to keep: the party already remembers what the game noted tonight.')}
          </p>
        ) : (
          <>
            <p className="muted">
              {t(
                'Tick what the party should remember. The chapter is written from the party’s memories.',
              )}
            </p>
            <ul className="evening-list">
              {suggestions.map((entry) => {
                const kicker = KICKERS[entry.reason];
                return (
                  <li key={entry.suggestionId}>
                    <label>
                      <input
                        type="checkbox"
                        checked={!dropped.has(entry.suggestionId)}
                        onChange={(event) => {
                          const next = new Set(dropped);
                          if (event.target.checked) next.delete(entry.suggestionId);
                          else next.add(entry.suggestionId);
                          setDropped(next);
                        }}
                      />
                      <span>
                        {kicker && <small>{t(kicker)}</small>}
                        {momentWords(entry)}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </>
        )}
        <label className="evening-line" htmlFor={`${ids}-line`}>
          {t('What mattered most tonight, in your own words (optional)')}
        </label>
        <textarea
          id={`${ids}-line`}
          rows={2}
          maxLength={300}
          aria-describedby={`${ids}-line-hint`}
          value={line}
          onChange={(event) => {
            setLine(event.target.value);
          }}
        />
        <p id={`${ids}-line-hint`} className="muted">
          {t(
            'It goes into the chapter as written, and the party reads it. Say it as the party would: “We swore to find the caravan.”',
          )}
        </p>
      </fieldset>
      <fieldset className="evening-options" disabled={busy}>
        <legend>{t('When the session ends')}</legend>
        <label>
          <input
            type="checkbox"
            checked={chapter}
            aria-describedby={`${ids}-chapter`}
            onChange={(event) => {
              setChapter(event.target.checked);
            }}
          />
          {t('Write a chapter about this session')}
        </label>
        <p id={`${ids}-chapter`} className="muted">
          {t(
            'The story of this session as the party saw it. Players read it in the Chronicle, and it opens the next session as “Previously…”. To undo something from tonight later, you will first have to undo the chapter.',
          )}
        </p>
        <label>
          <input
            type="checkbox"
            checked={stars}
            aria-describedby={`${ids}-stars`}
            onChange={(event) => {
              setStars(event.target.checked);
            }}
          />
          {t('Ask everyone for stars and wishes on the table’s screens')}
        </label>
        <p id={`${ids}-stars`} className="muted">
          {t(
            'Everyone names a star — what they liked, read by all — and a wish for next time, read only by you. Players write on their own screens either way; you can write for a child who says it aloud.',
          )}
        </p>
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
      </fieldset>
      {busy && (
        <p role="status" className="book-writing">
          {t(STEP_WORDS[step ?? 'moments'])}
        </p>
      )}
      {stopped !== null && (
        <p role="alert" className="authoring-notice error">
          {stopped.stopped === 'moments'
            ? t(
                'The evening’s moments could not all be kept, and the session is still open. Moments kept so far: {count}. Try again.',
                { count: stopped.kept },
              )
            : t('The session could not be ended. Moments kept so far: {count}. Try again.', {
                count: stopped.kept,
              })}
        </p>
      )}
      <div className="action-row">
        <button
          type="button"
          className="primary-button"
          disabled={locked || busy || reading}
          onClick={() => void close()}
        >
          {t('Yes, end the session')}
        </button>
        <button type="button" disabled={busy} onClick={onKeepPlaying}>
          {t('Keep playing')}
        </button>
      </div>
    </div>
  );
}
