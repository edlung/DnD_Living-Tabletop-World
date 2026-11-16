import { STORY_CAST_CHARS, type ChronicleListResponse, type EntityRef } from '@ltw/contracts';
import { useT } from '@ltw/ui';
import { useCallback, useId, useMemo } from 'react';

import type { WorldApi } from '../api/client.ts';
import { useResource } from '../api/resource.ts';
import { PARTY } from '../chronicle/book-chapters.ts';

/** Paragraphs of the party's chapters the form offers: the newest chapters' first. */
const OFFERED = 12;
const NONE = '';

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
          text: paragraph.text.trim().slice(0, STORY_CAST_CHARS),
        })),
      )
      .filter((paragraph) => paragraph.text !== '')
      .slice(0, OFFERED);
  }, [chronicle.resource]);
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
          {t('{count} of {max} characters. Everyone at the table reads them.', {
            count: text.length,
            max: STORY_CAST_CHARS,
          })}
        </p>
      </div>
      {offered.length > 0 && (
        <div className="field">
          <label htmlFor={`${id}-from`}>{t('Or take a paragraph of the party’s chapters')}</label>
          <select
            id={`${id}-from`}
            value={NONE}
            onChange={(event) => {
              const chosen = offered.find((paragraph) => paragraph.key === event.target.value);
              if (chosen) onText(chosen.text);
            }}
          >
            <option value={NONE}>{t('Choose…')}</option>
            {offered.map((paragraph) => (
              <option key={paragraph.key} value={paragraph.key}>
                {`${paragraph.chapter}: ${paragraph.text.slice(0, 60)}${paragraph.text.length > 60 ? '…' : ''}`}
              </option>
            ))}
          </select>
        </div>
      )}
    </>
  );
}
