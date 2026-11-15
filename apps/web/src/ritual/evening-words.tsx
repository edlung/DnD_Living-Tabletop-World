import { REFLECTION_CHARS, type EntityRef, type SessionReflections } from '@ltw/contracts';
import { useT } from '@ltw/ui';
import { useEffect, useId, useRef, useState } from 'react';

import type { WorldApi } from '../api/client.ts';
import { Glyph } from '../visual/glyph.tsx';
import { starsOf, useReflections, wishesOf, writeReflection } from './reflections.ts';
import { WordsList } from './stars-list.tsx';

const DM = '';

/**
 * Stars and wishes on the DM's Session sheet between sessions
 * (docs/adr/0071-memory-and-ritual.md §2): the last evening's stars, and — the DM's alone — its
 * wishes, to prepare the next session by; the words of someone who said them aloud, written for
 * them; the stars shown on the table's screens; earlier evenings kept to read.
 */
export function EveningWords({
  api,
  revision,
  characters,
}: {
  readonly api: WorldApi;
  readonly revision: number;
  /** Everyone at the table the DM may write for. */
  readonly characters: readonly EntityRef[];
}) {
  const t = useT();
  const ids = useId();
  const { sessions, reread } = useReflections(api, revision);
  const [cast, setCast] = useState<'shown' | 'failed' | null>(null);
  if (sessions === null || sessions.length === 0) return null;
  const [latest, ...earlier] = sessions;
  if (!latest) return null;
  return (
    <section className="tool-group evening-after" aria-labelledby={`${ids}-title`}>
      <h3 id={`${ids}-title`}>
        <Glyph name="blessing" />
        {t('Stars and wishes')}
      </h3>
      <SessionWords session={latest} headed />
      {latest.open && (
        <WriteFor api={api} session={latest} characters={characters} onKept={reread} />
      )}
      <div className="action-row">
        <button
          type="button"
          onClick={() => {
            setCast(null);
            void api
              .post('display/cast', { cast: { kind: 'stars' } }, AbortSignal.timeout(20_000))
              .then(
                () => {
                  setCast('shown');
                },
                () => {
                  setCast('failed');
                },
              );
          }}
        >
          <Glyph name="live" />
          {t('Show the stars on the table’s screens')}
        </button>
      </div>
      <p role="status" className="muted evening-status">
        {cast === 'shown' ? t('The table’s screens show the stars. Wishes stay with you.') : ''}
      </p>
      {cast === 'failed' && (
        <p role="alert" className="authoring-notice error">
          {t('The stars could not be shown on the table’s screens. Try again.')}
        </p>
      )}
      {earlier.length > 0 && (
        <details className="evening-earlier">
          <summary>{t('Earlier evenings')}</summary>
          {earlier.map((session) => (
            <SessionWords key={session.sessionId} session={session} headed />
          ))}
        </details>
      )}
    </section>
  );
}

/** One evening's stars and, for the DM, its wishes. */
function SessionWords({
  session,
  headed,
}: {
  readonly session: SessionReflections;
  readonly headed: boolean;
}) {
  const t = useT();
  const stars = starsOf(session);
  const wishes = wishesOf(session);
  return (
    <div className="evening-session">
      {headed && <h4>{session.title}</h4>}
      {stars.length === 0 && wishes.length === 0 ? (
        <p className="muted">
          {session.open
            ? t(
                'Nobody has written yet. Players write on their own screens; you can write for someone who said it aloud.',
              )
            : t('Nothing was written for this evening.')}
        </p>
      ) : (
        <>
          <h5>{t('Stars — everyone reads them')}</h5>
          {stars.length > 0 ? (
            <WordsList entries={stars} words="star" />
          ) : (
            <p className="muted">{t('No stars yet.')}</p>
          )}
          {/* Closed until asked for: the sheet may lie open at the table, and a wish is private. */}
          {wishes.length > 0 ? (
            <details className="evening-wishes">
              <summary>
                {t('Wishes: {count} — only you read them', { count: wishes.length })}
              </summary>
              <WordsList entries={wishes} words="wish" />
            </details>
          ) : (
            <p className="muted">{t('No wishes yet.')}</p>
          )}
        </>
      )}
    </div>
  );
}

/**
 * The DM writes someone's star and wish — a child who said them aloud — or their own. What that
 * person already kept is laid in the fields first, so writing one never wipes the other: a child's
 * own wish stays unless the DM changes it on purpose, and the form says whose words they are.
 */
function WriteFor({
  api,
  session,
  characters,
  onKept,
}: {
  readonly api: WorldApi;
  readonly session: SessionReflections;
  readonly characters: readonly EntityRef[];
  readonly onKept: () => void;
}) {
  const t = useT();
  const ids = useId();
  const [who, setWho] = useState(DM);
  const kept = session.entries.find((entry) => (entry.author?.entityId ?? DM) === who) ?? null;
  const keptStar = kept?.star ?? '';
  const keptWish = kept?.wish ?? '';
  const [star, setStar] = useState(keptStar);
  const [wish, setWish] = useState(keptWish);
  // Untouched fields follow what the person keeps (they may write on their own screen meanwhile);
  // touched ones are the DM's draft and stay.
  const touched = useRef(false);
  useEffect(() => {
    if (touched.current) return;
    setStar(keptStar);
    setWish(keptWish);
  }, [who, keptStar, keptWish]);
  const [state, setState] = useState<'busy' | 'kept' | 'failed' | null>(null);
  const select = useRef<HTMLSelectElement>(null);
  const name =
    who === DM
      ? t('The DM')
      : (characters.find((character) => character.entityId === who)?.name ??
        t('Someone at the table'));
  const save = async () => {
    if (star.trim() === '' && wish.trim() === '' && kept === null) return;
    setState('busy');
    const done = await writeReflection(api, {
      sessionId: session.sessionId,
      characterId: who === DM ? null : who,
      star: star.trim(),
      wish: wish.trim(),
    });
    setState(done ? 'kept' : 'failed');
    if (!done) return;
    touched.current = false;
    onKept();
    select.current?.focus();
  };
  return (
    <details className="evening-write">
      <summary>{t('Write a star and a wish for someone')}</summary>
      <form
        className="hand-form"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <label htmlFor={`${ids}-who`}>{t('Whose words')}</label>
        <select
          ref={select}
          id={`${ids}-who`}
          value={who}
          onChange={(event) => {
            touched.current = false;
            setWho(event.target.value);
            setState(null);
          }}
        >
          <option value={DM}>{t('Mine (the DM)')}</option>
          {characters.map((character) => (
            <option key={character.entityId} value={character.entityId}>
              {character.name}
            </option>
          ))}
        </select>
        {kept !== null && who !== DM && (
          <p className="muted">
            {t('{name} has already written. You are changing their words.', { name })}
          </p>
        )}
        <label htmlFor={`${ids}-star`}>{t('Star (everyone reads it)')}</label>
        <textarea
          id={`${ids}-star`}
          rows={2}
          maxLength={REFLECTION_CHARS}
          value={star}
          onChange={(event) => {
            touched.current = true;
            setStar(event.target.value);
          }}
        />
        <label htmlFor={`${ids}-wish`}>{t('Wish (only you read it)')}</label>
        <textarea
          id={`${ids}-wish`}
          rows={2}
          maxLength={REFLECTION_CHARS}
          value={wish}
          onChange={(event) => {
            touched.current = true;
            setWish(event.target.value);
          }}
        />
        <div className="action-row">
          <button type="submit" className="primary-button" disabled={state === 'busy'}>
            {t('Keep them')}
          </button>
        </div>
        <p role="status" className="muted evening-status">
          {state === 'kept' ? t('Kept for {name}.', { name }) : ''}
        </p>
        {state === 'failed' && (
          <p role="alert" className="authoring-notice error">
            {t('They were not kept. Your words are still here — try again.')}
          </p>
        )}
      </form>
    </details>
  );
}
