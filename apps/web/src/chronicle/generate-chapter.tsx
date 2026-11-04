import type { EntityRef, GenerateChronicleResponse } from '@ltw/contracts';
import { useT } from '@ltw/ui';
import { useState } from 'react';

import { ApiError, type WorldApi } from '../api/client.ts';
import { Opening } from '../shell/opening.tsx';
import { Glyph } from '../visual/glyph.tsx';
import { chapterMessage } from './chapter-message.ts';

/**
 * The DM writes a chapter, in the book's header (docs/STAGE_320_DESIGN.md §5.6): a title and
 * who it is told from; the server computes the entries, writes the prose and checks it. While
 * it writes the book says so; afterwards it says honestly which prose the chapter holds and
 * why (ADR 0032, C), and never promises other prose later. The draft title survives closing.
 */
export function GenerateChapter({
  api,
  characters,
  onWritten,
}: {
  readonly api: WorldApi;
  readonly characters: readonly EntityRef[];
  /** A chapter was recorded: the book reads its chapters again and opens this one. */
  readonly onWritten: (chronicleId: string | null) => void;
}) {
  const t = useT();
  const [title, setTitle] = useState(() => t('Chapter I — Shadows on the Trade Road'));
  const [scope, setScope] = useState('PARTY');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const generate = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const result = await api.post<GenerateChronicleResponse>(
        'chronicle',
        { title, perspective: scope, from: 0 },
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
            setTitle(event.target.value);
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
