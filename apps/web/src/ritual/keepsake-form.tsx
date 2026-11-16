import { KEEPSAKE_LINE_CHARS, type KeepsakeView } from '@ltw/contracts';
import { useT } from '@ltw/ui';
import { useEffect, useId, useRef, useState } from 'react';

import type { WorldApi } from '../api/client.ts';
import { choiceOf, choiceValue, useKeepsakeChoices, writeKeepsake } from './ending.ts';

/**
 * Choosing what a hero keeps from a finished adventure (docs/adr/0072-keepsakes.md §2): one
 * control with the things the hero carries and the chapters of the party's story, and a line
 * about it. The whole table reads the choice, and the form says so. A choice already made may be
 * taken back. While the choices are read the form says so and holds focus; with nothing to
 * choose from it says that, and offers nothing to press but "Not now".
 */
export function KeepsakeForm({
  api,
  characterId,
  heroName,
  kept,
  onDone,
  onCancel,
}: {
  readonly api: WorldApi;
  readonly characterId: string;
  readonly heroName: string;
  /** What the hero keeps now; null when nothing yet. */
  readonly kept: KeepsakeView | null;
  /** The choice was kept (true), or taken back (false). */
  readonly onDone: (kept: boolean) => void;
  readonly onCancel: () => void;
}) {
  const t = useT();
  const ids = useId();
  const choices = useKeepsakeChoices(api, characterId);
  const [choice, setChoice] = useState(kept ? choiceValue(kept.kind, kept.refId) : '');
  const [line, setLine] = useState(kept?.line ?? '');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<'unchosen' | 'failed' | null>(null);
  const first = useRef<HTMLSelectElement>(null);
  const waiting = useRef<HTMLParagraphElement>(null);
  const ready = choices !== null;
  // Focus follows what stands in the form: the line that says it is being read, then the control.
  useEffect(() => {
    (ready ? (first.current ?? waiting.current) : waiting.current)?.focus();
  }, [ready]);
  if (choices === null) {
    return (
      <p ref={waiting} role="status" tabIndex={-1} className="stars-hint">
        {t('Looking into the pack…')}
      </p>
    );
  }
  const send = async (keep: Parameters<typeof writeKeepsake>[1]['keep']) => {
    if (busy) return;
    setBusy(true);
    setProblem(null);
    const done = await writeKeepsake(api, { characterId, keep });
    setBusy(false);
    if (done) onDone(keep !== null);
    else setProblem('failed');
  };
  // What was kept may be gone from the pack since: it stays listed, under its name then.
  const listed = [...choices.items, ...choices.chapters].some(
    (one) => kept !== null && one.id === kept.refId,
  );
  if (choices.items.length + choices.chapters.length === 0 && kept === null) {
    return (
      <div className="stars-form keepsake-form">
        <p ref={waiting} tabIndex={-1} className="stars-line">
          {t(
            'There is nothing to choose from yet: {hero} carries nothing, and the story has no chapter.',
            { hero: heroName },
          )}
        </p>
        <div className="action-row">
          <button type="button" onClick={onCancel}>
            {t('Not now')}
          </button>
        </div>
      </div>
    );
  }
  return (
    <form
      className="stars-form keepsake-form"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        const chosen = choiceOf(choice);
        if (chosen === null) {
          setProblem('unchosen');
          first.current?.focus();
          return;
        }
        void send({ ...chosen, line: line.trim() });
      }}
    >
      <label htmlFor={`${ids}-what`}>{t('What {hero} keeps', { hero: heroName })}</label>
      <select
        ref={first}
        id={`${ids}-what`}
        value={choice}
        aria-invalid={problem === 'unchosen'}
        aria-describedby={`${ids}-hint`}
        onChange={(event) => {
          setChoice(event.target.value);
          setProblem(null);
        }}
      >
        <option value="">{t('Choose…')}</option>
        {kept !== null && !listed && (
          <option value={choiceValue(kept.kind, kept.refId)}>{kept.label}</option>
        )}
        {choices.items.length > 0 && (
          <optgroup label={t('Things the hero carries')}>
            {choices.items.map((item) => (
              <option key={item.id} value={choiceValue('item', item.id)}>
                {item.name}
              </option>
            ))}
          </optgroup>
        )}
        {choices.chapters.length > 0 && (
          <optgroup label={t('Chapters of our story')}>
            {choices.chapters.map((chapter) => (
              <option key={chapter.id} value={choiceValue('chapter', chapter.id)}>
                {chapter.name}
              </option>
            ))}
          </optgroup>
        )}
      </select>
      <p id={`${ids}-hint`} className="stars-hint">
        {t(
          'One keepsake: a thing the hero carries or a chapter of the story. Everyone at the table reads it, and it goes into the book.',
        )}
      </p>
      <label htmlFor={`${ids}-line`}>{t('A few words about it (optional)')}</label>
      <textarea
        id={`${ids}-line`}
        rows={2}
        maxLength={KEEPSAKE_LINE_CHARS}
        value={line}
        onChange={(event) => {
          setLine(event.target.value);
        }}
      />
      {problem !== null && (
        <p role="alert" className="stars-failed">
          {problem === 'unchosen'
            ? t('Choose a thing or a chapter first.')
            : t('It was not kept. Your words are still here — try again.')}
        </p>
      )}
      <div className="action-row">
        <button type="submit" className="primary-button" aria-disabled={busy}>
          {t('Keep this')}
        </button>
        {kept !== null && (
          <button type="button" aria-disabled={busy} onClick={() => void send(null)}>
            {t('Keep nothing')}
          </button>
        )}
        <button type="button" aria-disabled={busy} onClick={onCancel}>
          {t('Not now')}
        </button>
      </div>
    </form>
  );
}
