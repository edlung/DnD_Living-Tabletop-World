import type {
  ChronicleChapterView,
  ChronicleEntryView,
  EntityPresentationResponse,
  EntityRef,
} from '@ltw/contracts';
import { useT } from '@ltw/ui';
import { useCallback, useId } from 'react';

import type { WorldApi } from '../api/client.ts';
import { useResource } from '../api/resource.ts';
import { formatWorldTime } from '../dm/world-time.ts';
import { useApprovedImage } from '../visual/approved-images.ts';
import { Glyph } from '../visual/glyph.tsx';
import { KnowledgeBadge } from '../visual/knowledge-cards.tsx';
import { Medallion } from '../visual/medallion.tsx';
import { textureUrl } from '../visual/ui-kit.ts';
import { usePortrait } from '../world/use-portrait.ts';
import { pictureNote } from './picture-note.ts';
import {
  citedEntries,
  eventWords,
  learned,
  mainPlace,
  peopleMet,
  proseTeller,
  toldFrom,
} from './chapter-facts.ts';

/**
 * The chapter's main place as the perspective saw it when the chapter ends (ADR 0023): its
 * approved image, or the neutral mist — never a stand-in — with a note only when the
 * presentation says why (`pictureNote`).
 */
function PlacePlate({
  api,
  place,
  at,
}: {
  readonly api: WorldApi;
  readonly place: EntityRef | null;
  readonly at: number;
}) {
  const t = useT();
  const placeId = place?.entityId ?? null;
  const load = useCallback(
    (signal: AbortSignal) =>
      placeId === null
        ? Promise.resolve(null)
        : api.get<EntityPresentationResponse>(
            `entities/${encodeURIComponent(placeId)}/presentation`,
            signal,
            true,
            { at: String(at) },
          ),
    [api, placeId, at],
  );
  const { resource } = useResource(`plate:${placeId ?? ''}:${String(at)}`, load);
  const image = resource.status === 'ready' ? (resource.value?.presentation.image ?? null) : null;
  const url = useApprovedImage(image);
  const note = pictureNote(
    place !== null,
    resource.status === 'loading'
      ? 'loading'
      : resource.status === 'error'
        ? 'withheld'
        : { image },
  );
  return (
    <figure className={`chapter-plate${url ? '' : ' chapter-plate--mist'}`}>
      <img src={url ?? textureUrl('scene-fallback')} alt="" draggable={false} />
      <figcaption>
        {place && <span className="chapter-plate-place">{place.name}</span>}
        {note && <span className="chapter-plate-note">{t(note)}</span>}
      </figcaption>
    </figure>
  );
}

/**
 * A passage's sources in the margin: the entries it cites with their epistemic types, what
 * recorded them in words, and the references themselves on demand. The handwriting is only the
 * note's decoration; the provenance is set in the text face.
 */
function MarginNote({
  entries,
  passage,
  isDm,
}: {
  readonly entries: readonly ChronicleEntryView[];
  /** The passage's own words: an entry that says exactly this is not repeated. */
  readonly passage: string;
  readonly isDm: boolean;
}) {
  const t = useT();
  const sources = entries.flatMap((entry) => entry.sources);
  const kinds = [...new Set(sources.map((source) => t(eventWords(source.eventType))))];
  return (
    <div className="margin-note" role="note" aria-label={t('Sources of this passage')}>
      <span className="margin-mark" aria-hidden="true">
        {t('noted')}
      </span>
      <ul>
        {entries.map((entry) => (
          <li key={entry.key}>
            {entry.text !== passage && <span>{entry.text}</span>}
            {entry.knowledge.map((record) => (
              <KnowledgeBadge key={record.knowledgeId} type={record.knowledgeType} />
            ))}
          </li>
        ))}
      </ul>
      {kinds.length > 0 && <p>{t('Recorded as: {kinds}', { kinds: kinds.join(', ') })}</p>}
      {sources.length > 0 && (
        <details className="source-references">
          <summary>{t('Source references')}</summary>
          <ul>
            {sources.map((source) => (
              <li key={source.eventId}>
                <code>{source.eventId}</code> · {t(eventWords(source.eventType))}
                {isDm && source.sequence !== undefined && ` · #${String(source.sequence)}`}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function Person({ api, person }: { readonly api: WorldApi; readonly person: EntityRef }) {
  const image = usePortrait(api, person.entityId);
  return (
    <li className="person-met">
      <Medallion image={image} kind={person.kind} size="md" />
      <span>{person.name}</span>
    </li>
  );
}

/**
 * A chapter on two facing pages (docs/STAGE_320_DESIGN.md §5.6): the left page holds the title,
 * the illustration slot and the prose — exactly as written, each passage with its sources in
 * the margin — and the right page the key moments (the entries, each memory with its
 * flashback), what was learned as typed records, and the people met. Each page scrolls inside
 * itself; on a phone the two run on as one page, in the same order.
 */
export function ChapterPages({
  api,
  chapter,
  isDm,
  names,
  onFlashback,
}: {
  readonly api: WorldApi;
  readonly chapter: ChronicleChapterView;
  readonly isDm: boolean;
  /** Names of the perspective's characters and NPCs, for "told from". */
  readonly names: ReadonlyMap<string, string>;
  readonly onFlashback: (entry: ChronicleEntryView, opener: HTMLElement) => void;
}) {
  const t = useT();
  const ids = useId();
  const records = learned(chapter);
  const people = peopleMet(chapter);
  return (
    <article className="book-chapter" aria-label={chapter.title}>
      <div className="book-page book-page--left">
        <header className="chapter-head">
          <p className="chapter-eyebrow">
            {formatWorldTime(chapter.from, t)} – {formatWorldTime(chapter.to, t)}
            {isDm && ` · ${t('told from {who}', { who: toldFrom(t, chapter.perspective, names) })}`}
          </p>
          <h3>{chapter.title}</h3>
        </header>
        <PlacePlate api={api} place={mainPlace(chapter)} at={chapter.to} />
        <div className="chapter-prose">
          {chapter.prose.paragraphs.map((paragraph, index) => (
            <div key={index} className="chronicle-paragraph">
              <p>{paragraph.text}</p>
              <MarginNote
                entries={citedEntries(chapter, paragraph)}
                passage={paragraph.text}
                isDm={isDm}
              />
            </div>
          ))}
        </div>
        <div className="chapter-teller">
          <p>{t(proseTeller(chapter.prose.provider))}</p>
          <details className="source-references">
            <summary>{t('How it was written')}</summary>
            <p>
              <code>
                {chapter.prose.provider} · {chapter.prose.model}
                {chapter.prose.traceId ? ` · ${chapter.prose.traceId}` : ''}
              </code>
            </p>
          </details>
        </div>
      </div>
      <div className="book-page book-page--right">
        <section className="book-section" aria-labelledby={`${ids}-moments`}>
          <h4 id={`${ids}-moments`}>
            <Glyph name="chapter" />
            {t('Key moments')}
          </h4>
          <ol className="key-moments">
            {chapter.entries.map((entry) => (
              <li key={entry.key}>
                <p className="moment-when">
                  {formatWorldTime(entry.occurredAt, t)}
                  {entry.location && ` · ${entry.location.name}`}
                </p>
                <p className="moment-text">{entry.text}</p>
                {entry.memoryId && (
                  <button
                    type="button"
                    className="flashback-button"
                    onClick={(event) => {
                      onFlashback(entry, event.currentTarget);
                    }}
                  >
                    <Glyph name="flashback" />
                    {t('Open flashback')}
                  </button>
                )}
              </li>
            ))}
          </ol>
        </section>
        {records.length > 0 && (
          <section className="book-section" aria-labelledby={`${ids}-learned`}>
            <h4 id={`${ids}-learned`}>
              <Glyph name="memory" />
              {t('What was learned')}
            </h4>
            <ul className="learned-list">
              {records.map((record) => (
                <li key={record.knowledgeId}>
                  <KnowledgeBadge type={record.knowledgeType} />
                  <p>{record.statement}</p>
                </li>
              ))}
            </ul>
          </section>
        )}
        {people.length > 0 && (
          <section className="book-section" aria-labelledby={`${ids}-people`}>
            <h4 id={`${ids}-people`}>
              <Glyph name="character" />
              {t('People met')}
            </h4>
            <ul className="people-met">
              {people.map((person) => (
                <Person key={person.entityId} api={api} person={person} />
              ))}
            </ul>
          </section>
        )}
      </div>
    </article>
  );
}
