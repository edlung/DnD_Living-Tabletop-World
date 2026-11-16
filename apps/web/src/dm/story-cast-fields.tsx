import { STORY_CAST_CHARS, type ChronicleListResponse, type EntityRef } from '@ltw/contracts';
import { useT } from '@ltw/ui';
import { useCallback, useId, useMemo, useState } from 'react';

import type { WorldApi } from '../api/client.ts';
import { useResource } from '../api/resource.ts';
import { PARTY } from '../chronicle/book-chapters.ts';

/** Paragraphs of the party's chapters the form offers: the newest chapters' first. */
const OFFERED = 12;
const NONE = '';
/** Lines after which the words may not fit a screen: the form says so. */
const LINES = 8;

/** A paragraph cut to the cast's size at the end of a sentence, or of a word. */
export function fitted(text: string, max = STORY_CAST_CHARS): string {
  const whole = text.trim();
  if (whole.length <= max) return whole;
  const cut = whole.slice(0, max);
  const sentence = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
  if (sentence > max / 2) return cut.slice(0, sentence + 1);
  const word = cut.lastIndexOf(' ');
  return `${cut.slice(0, word > 0 ? Math.min(word, max - 1) : max - 1)}…`;
}

/**
 * The fields of the story cast (docs/adr/0073-table-ideas.md §8): a picture the party knows, or
 * none, and the words to read aloud — typed, or taken from a paragraph of the party's own
 * chapters. The chapters are read in the party's view, so nothing told from the DM is offered.
 */
export function StoryCastFields({
  api,
  pictures,
  entityId,
  text,
  onEntity,
  onText,
}: {
  readonly api: WorldApi;
  /** What may be pictured: the DM's directory, as the picture cast offers it. */
  readonly pictures: readonly EntityRef[];
  readonly entityId: string;
  readonly text: string;
  readonly onEntity: (entityId: string) => void;
  readonly onText: (text: string) => void;
}) {
  const t = useT();
  const id = useId();
  const party = useMemo(() => api.as(PARTY), [api]);
  const load = useCallback(
    (signal: AbortSignal) => party.get<ChronicleListResponse>('chronicle', signal).catch(() => null),
    [party],
  );
  const chronicle = useResource('story-cast-chapters', load);
  const offered = useMemo(() => {
    const chapters =
      chronicle.resource.status === 'ready' ? (chronicle.resource.value?.chapters ?? []) : [];
    return chapters
      .filter((chapter) => chapter.perspective === PARTY)
      .reverse()
      .flatMap((chapter) =>
        chapter.prose.paragraphs.map((paragraph, index) => ({
          key: `${chapter.chronicleId}:${String(index)}`,
          chapter: chapter.title,
          text: fitted(paragraph.text),
        })),
      )
      .filter((paragraph) => paragraph.text !== '')
      .slice(0, OFFERED);
  }, [chronicle.resource]);
  // The paragraph chosen, and whether taking it would replace words the DM typed.
  const [from, setFrom] = useState(NONE);
  const [asking, setAsking] = useState(false);
  const chosen = offered.find((paragraph) => paragraph.key === from) ?? null;
  const take = () => {
    if (chosen === null) return;
    onText(chosen.text);
    setAsking(false);
    setFrom(NONE);
  };
  const lines = text.split('\n').filter((line) => line.trim() !== '').length;
  return (
    <>
      <div className="field">
        <label htmlFor={`${id}-picture`}>{t('The picture')}</label>
        <select
          id={`${id}-picture`}
          value={entityId}
          aria-describedby={`${id}-picture-hint`}
          onChange={(event) => {
            onEntity(event.target.value);
          }}
        >
          <option value={NONE}>{t('No picture: the game’s own art')}</option>
          {pictures.map((entity) => (
            <option key={entity.entityId} value={entity.entityId}>
              {entity.name}
            </option>
          ))}
        </select>
        <p id={`${id}-picture-hint`} className="field-hint">
          {t('A screen shows only an approved picture the party knows.')}
        </p>
      </div>
      <div className="field">
        <label htmlFor={`${id}-words`}>{t('The words to read aloud')}</label>
        <textarea
          id={`${id}-words`}
          rows={5}
          maxLength={STORY_CAST_CHARS}
          value={text}
          aria-describedby={`${id}-words-hint`}
          onChange={(event) => {
            onText(event.target.value);
          }}
        />
        <p id={`${id}-words-hint`} className="field-hint">
          {t('{left} characters left. Everyone at the table sees these words.', {
            left: STORY_CAST_CHARS - text.length,
          })}
          {lines > LINES &&
            ` ${t('So many lines may not fit a screen: show them in two parts.')}`}
        </p>
      </div>
      {offered.length > 0 && (
        <div className="field">
          <label htmlFor={`${id}-from`}>{t('Or take a paragraph of the party’s chapters')}</label>
          <select
            id={`${id}-from`}
            value={from}
            onChange={(event) => {
              setFrom(event.target.value);
              setAsking(false);
            }}
          >
            <option value={NONE}>{t('Choose…')}</option>
            {offered.map((paragraph) => (
              <option key={paragraph.key} value={paragraph.key}>
                {`${paragraph.chapter}: ${paragraph.text.slice(0, 60)}${paragraph.text.length > 60 ? '…' : ''}`}
              </option>
            ))}
          </select>
          {/* Choosing shows nothing yet: the press takes it, and asks before it replaces words. */}
          {asking ? (
            <div className="action-row" role="group" aria-label={t('Replace what you wrote?')}>
              <span>{t('Replace what you wrote?')}</span>
              <button type="button" onClick={take}>
                {t('Replace')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setAsking(false);
                }}
              >
                {t('Keep mine')}
              </button>
            </div>
          ) : (
            <div className="action-row">
              <button
                type="button"
                aria-disabled={chosen === null}
                onClick={() => {
                  if (chosen === null) return;
                  if (text.trim() !== '' && text.trim() !== chosen.text) setAsking(true);
                  else take();
                }}
              >
                {t('Take this paragraph')}
              </button>
            </div>
          )}
        </div>
      )}
    </>
  );
}
