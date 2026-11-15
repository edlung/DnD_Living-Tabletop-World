import type { EntityRef, GenerateChronicleResponse, SessionListResponse } from '@ltw/contracts';
import { useT } from '@ltw/ui';
import { useCallback, useState } from 'react';

import { ApiError, type WorldApi } from '../api/client.ts';
import { useResource } from '../api/resource.ts';
import { Opening } from '../shell/opening.tsx';
import { Glyph } from '../visual/glyph.tsx';
import { chapterTitle, lastSession, sessionChapter } from './book-chapters.ts';
import { chapterMessage } from './chapter-message.ts';

/**
 * The DM writes a chapter, in the book's header (docs/STAGE_320_DESIGN.md §5.6): a title, who it
 * is told from and what it covers — the last session, whose title it proposes, or the whole story
 * (ADR 0071 §1); the server computes the entries, writes the prose and checks it. While
 * it writes the book says so; afterwards it says honestly which prose the chapter holds and
 * why (ADR 0032, C), and never promises other prose later. The draft title survives closing.
 */
export function GenerateChapter({
  api,
  characters,
  written,
  onWritten,
}: {
  readonly api: WorldApi;
  readonly characters: readonly EntityRef[];
  /** How many chapters the book holds: the next one's number when no session names it. */
  readonly written: number;
  /** A chapter was recorded: the book reads its chapters again and opens this one. */
  readonly onWritten: (chronicleId: string | null) => void;
}) {
  const t = useT();
  const loadSessions = useCallback(
    (signal: AbortSignal) => api.get<SessionListResponse>('sessions', signal, false),
    [api],
  );
  const sessions = useResource('chapter-sessions', loadSessions);
  const session =
    sessions.resource.status === 'ready' ? lastSession(sessions.resource.value.sessions) : null;
  // The DM's own words once typed; until then the session's title, or the chapter's number.
  const [typed, setTyped] = useState<string | null>(null);
  const title =
    typed ??
    (session ? chapterTitle(session.title) : t('Chapter {number}', { number: written + 1 }));
  const [scope, setScope] = useState('PARTY');
  const [whole, setWhole] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const generate = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const result = await api.post<GenerateChronicleResponse>(
        'chronicle',
        {
          title: title.trim(),
          perspective: scope,
          ...(session && !whole ? sessionChapter(session) : { from: 0 }),
        },
        new AbortController().signal,
      );
      // Honest provenance (ADR 0032, C): which prose the chapter holds, and why.
      setMessage(t(chapterMessage(result)));
      if (result.result.status !== 'rejected') onWritten(result.chronicleId);
    } catch (error) {
      setMessage(
        error instanceof ApiError && error.status === 422
          ? t('There is nothing to tell for that view yet.')
          : t('The chronicle could not be written. Please try again.'),
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <Opening
      className="disclosure book-writer"
      summary={
        <>
          <Glyph name="chronicle" />
          {t('Write a chapter (DM)')}
        </>
      }
    >
      <div className="book-writer-form">
        <label htmlFor="chapter-title">{t('Title')}</label>
        <input
          id="chapter-title"
          value={title}
          onChange={(event) => {
            setTyped(event.target.value);
          }}
        />
        <label htmlFor="chapter-scope">{t('Told from')}</label>
        <select
          id="chapter-scope"
          value={scope}
          onChange={(event) => {
            setScope(event.target.value);
          }}
        >
          <option value="PARTY">{t('Party')}</option>
          <option value="PUBLIC">{t('Public')}</option>
          {characters.map((entity) => (
            <option key={entity.entityId} value={`CHARACTER:${entity.entityId}`}>
              {entity.name}
            </option>
          ))}
        </select>
        {session && (
          <>
            <label htmlFor="chapter-covers">{t('Covers')}</label>
            <select
              id="chapter-covers"
              value={whole ? 'all' : 'session'}
              onChange={(event) => {
                setWhole(event.target.value === 'all');
              }}
            >
              <option value="session">{t('“{title}” only', { title: session.title })}</option>
              <option value="all">{t('The whole story so far')}</option>
            </select>
          </>
        )}
        <button
          type="button"
          className="primary-button"
          disabled={busy || title.trim() === ''}
          onClick={() => void generate()}
        >
          <Glyph name="chapter" />
          {t('Write chapter')}
        </button>
        {busy && (
          <p role="status" className="book-writing">
            {t('Writing the chapter…')}
          </p>
        )}
        {message && <p role="status">{message}</p>}
      </div>
    </Opening>
  );
}
