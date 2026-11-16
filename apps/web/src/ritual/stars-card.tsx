import { REFLECTION_CHARS } from '@ltw/contracts';
import { useT } from '@ltw/ui';
import { useEffect, useId, useRef, useState } from 'react';

import type { WorldApi } from '../api/client.ts';
import { Glyph } from '../visual/glyph.tsx';
import { openSession, starsOf, useReflections, writeReflection } from './reflections.ts';
import { WordsList } from './stars-list.tsx';

/**
 * A player's star and wish while the table waits for the next session
 * (docs/adr/0071-memory-and-ritual.md §2): what they kept, in their own words, or the question;
 * the two fields on demand — the star for everyone, the wish for the DM alone, said before each
 * field — and everyone's stars so far. Nothing is asked twice and nothing blocks: it can be left
 * unwritten.
 */
export function StarsCard({
  api,
  characterId,
  last = false,
}: {
  readonly api: WorldApi;
  /** The character the player writes as. */
  readonly characterId: string;
  /** The adventure is finished (ADR 0072 §2): no next game; the card stands under its end, quietly. */
  readonly last?: boolean;
}) {
  const t = useT();
  const ids = useId();
  const { sessions, reread } = useReflections(api);
  const session = openSession(sessions);
  const mine = session?.entries.find((entry) => entry.own) ?? null;
  const [open, setOpen] = useState(false);
  const [star, setStar] = useState('');
  const [wish, setWish] = useState('');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  // Said once after an entry was taken away: the question is back, and why.
  const [taken, setTaken] = useState(false);
  const first = useRef<HTMLTextAreaElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const folded = useRef(false);
  useEffect(() => {
    if (open) first.current?.focus();
    else if (folded.current) opener.current?.focus();
    folded.current = false;
  }, [open]);
  if (session === null) return null;
  const stars = starsOf(session);
  const empty = star.trim() === '' && wish.trim() === '';
  const fold = () => {
    folded.current = true;
    setOpen(false);
  };
  const keep = async () => {
    setBusy(true);
    setFailed(false);
    const kept = await writeReflection(api, {
      sessionId: session.sessionId,
      characterId,
      star: star.trim(),
      wish: wish.trim(),
    });
    setBusy(false);
    if (!kept) {
      setFailed(true);
      return;
    }
    setTaken(empty);
    reread();
    fold();
  };
  return (
    <section className="previously-brief stars-card" aria-labelledby={`${ids}-title`}>
      <p className="previously-eyebrow" id={`${ids}-title`}>
        <Glyph name="blessing" />
        {t('Stars and wishes')}
      </p>
      {open ? (
        <form
          className="stars-form"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void keep();
          }}
        >
          <label htmlFor={`${ids}-star`}>{t('A star: what did you like best?')}</label>
          <p id={`${ids}-star-hint`} className="stars-hint">
            {t('Everyone at the table reads your star. It also shows on the table’s screen.')}
          </p>
          <textarea
            ref={first}
            id={`${ids}-star`}
            rows={2}
            maxLength={REFLECTION_CHARS}
            aria-describedby={`${ids}-star-hint`}
            value={star}
            onChange={(event) => {
              setStar(event.target.value);
            }}
          />
          <label htmlFor={`${ids}-wish`}>{t('A wish: what do you want next time?')}</label>
          <p id={`${ids}-wish-hint`} className="stars-hint">
            {t('Only the DM reads your wish. The other players never see it.')}
          </p>
          <textarea
            id={`${ids}-wish`}
            rows={2}
            maxLength={REFLECTION_CHARS}
            aria-describedby={`${ids}-wish-hint`}
            value={wish}
            onChange={(event) => {
              setWish(event.target.value);
            }}
          />
          {failed && (
            <p role="alert" className="stars-failed">
              {t('They were not kept. Your words are still here — try again.')}
            </p>
          )}
          <div className="action-row">
            {/* Nothing to keep and nothing kept to take away: nothing to send. */}
            <button
              type="submit"
              className="primary-button"
              disabled={busy || (empty && mine === null)}
            >
              {t('Keep them')}
            </button>
            <button type="button" disabled={busy} onClick={fold}>
              {t('Not now')}
            </button>
          </div>
        </form>
      ) : (
        <>
          {mine ? (
            <dl className="stars-kept">
              {mine.star !== '' && (
                <>
                  <dt>{t('Your star (everyone reads it)')}</dt>
                  <dd>{mine.star}</dd>
                </>
              )}
              {mine.wish !== null && mine.wish !== '' && (
                <>
                  <dt>{t('Your wish (only the DM reads it)')}</dt>
                  <dd>{mine.wish}</dd>
                </>
              )}
            </dl>
          ) : (
            <p className="stars-line">
              {taken
                ? t('Your star and wish were taken away.')
                : last
                  ? t(
                      'The last game: “{title}”. Leave a star — what you liked — and, if you like, a wish for the next adventure.',
                      { title: session.title },
                    )
                  : t(
                      'The game is over: “{title}”. Leave a star — what you liked — and a wish for next time.',
                      { title: session.title },
                    )}
            </p>
          )}
          {mine && <p className="stars-hint">{t('You can change them until the next game.')}</p>}
          <div className="action-row">
            <button
              ref={opener}
              type="button"
              className={mine || last ? undefined : 'primary-button'}
              onClick={() => {
                setStar(mine?.star ?? '');
                setWish(mine?.wish ?? '');
                setFailed(false);
                setOpen(true);
              }}
            >
              {mine ? t('Change mine') : t('Write mine')}
            </button>
          </div>
        </>
      )}
      {stars.length > 0 && (
        <details className="stars-so-far">
          <summary>{t('Everyone’s stars: {count}', { count: stars.length })}</summary>
          <WordsList entries={stars} words="star" />
        </details>
      )}
    </section>
  );
}
