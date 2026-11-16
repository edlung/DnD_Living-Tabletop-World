import { StatusPanel, useT } from '@ltw/ui';
import { useId, useState } from 'react';

import type { WorldApi } from '../../api/client.ts';
import { Glyph } from '../../visual/glyph.tsx';
import type { GlyphName } from '../../visual/ui-kit-names.ts';
import { BookTile, useNear } from '../keepsake/book-pictures.tsx';
import { matching, type KnownEntry, type KnownFact } from './known-model.ts';
import { useKnown } from './use-known.ts';

/** A record is a fact unless its type says otherwise: the page says so beside it. */
const UNSURE: ReadonlySet<KnownFact['type']> = new Set([
  'TESTIMONY',
  'RUMOR',
  'INFERENCE',
  'HYPOTHESIS',
  'CONTRADICTION',
  'UNKNOWN',
]);

function Fact({ fact }: { readonly fact: KnownFact }) {
  const t = useT();
  return (
    <li>
      {UNSURE.has(fact.type) && <span className="known-type">{t(fact.type)}</span>}
      {fact.statement}
    </li>
  );
}

function Entry({
  api,
  entry,
  factsMissing,
  onChapter,
}: {
  readonly api: WorldApi;
  readonly entry: KnownEntry;
  /** The party's records were not read: "nothing more" would be a guess. */
  readonly factsMissing: boolean;
  readonly onChapter: (chronicleId: string) => void;
}) {
  const t = useT();
  const ids = useId();
  const [ref, near] = useNear<HTMLLIElement>(false);
  return (
    <li ref={ref} className="known-entry">
      {/* The picture as the party sees it now; none where the party has none. */}
      <BookTile api={api} entity={entry.entity} at={null} wanted={near} caption={null} />
      <div className="known-entry-text">
        <h4>{entry.entity.name}</h4>
        {entry.facts.length > 0 ? (
          <ul className="known-facts">
            {entry.facts.map((fact) => (
              <Fact key={fact.knowledgeId} fact={fact} />
            ))}
          </ul>
        ) : (
          !factsMissing && (
            <p className="known-none">{t('The party knows the name, and nothing more yet.')}</p>
          )
        )}
        {entry.chapters.length > 0 && (
          <p className="known-chapters" role="group" aria-labelledby={`${ids}-chapters`}>
            <span id={`${ids}-chapters`}>{t('In the chapters:')}</span>
            {entry.chapters.map((chapter) => (
              <button
                key={chapter.chronicleId}
                type="button"
                onClick={() => {
                  onChapter(chapter.chronicleId);
                }}
              >
                {chapter.title}
              </button>
            ))}
          </p>
        )}
      </div>
    </li>
  );
}

function Section({
  api,
  glyph,
  title,
  entries,
  typed,
  factsMissing,
  onChapter,
}: {
  readonly api: WorldApi;
  readonly glyph: GlyphName;
  readonly title: string;
  readonly entries: readonly KnownEntry[];
  readonly typed: string;
  readonly factsMissing: boolean;
  readonly onChapter: (chronicleId: string) => void;
}) {
  const ids = useId();
  const found = matching(entries, typed);
  if (found.length === 0) return null;
  return (
    <section className="known-section" aria-labelledby={`${ids}-title`}>
      <h3 id={`${ids}-title`}>
        <Glyph name={glyph} />
        {title}
        <small aria-hidden="true">{found.length}</small>
      </h3>
      <ul className="known-entries">
        {found.map((entry) => (
          <Entry
            key={entry.entity.entityId}
            api={api}
            entry={entry}
            factsMissing={factsMissing}
            onChapter={onChapter}
          />
        ))}
      </ul>
    </section>
  );
}

/**
 * "What we know" inside the Chronicle (docs/adr/0073-table-ideas.md §4): the party's
 * encyclopedia — people, places, things, what else it has learned and what it set out to do —
 * as one page that scrolls, with a field to find a name. Read as the party whoever looks, while
 * it is shown and not otherwise; put away it keeps what it read, so coming back from a chapter
 * finds the page where it was. Read only: nothing here writes.
 */
export function KnownView({
  api,
  shown,
  revision,
  onChapter,
}: {
  readonly api: WorldApi;
  /** The page is what the reader looks at now. */
  readonly shown: boolean;
  readonly revision: number;
  /** Opens the Chronicle at a chapter. */
  readonly onChapter: (chronicleId: string) => void;
}) {
  const t = useT();
  const ids = useId();
  const { api: party, known: read, failed, retry } = useKnown(api, shown, revision);
  const [typed, setTyped] = useState('');
  if (read === null) {
    if (!shown) return null;
    return (
      <div className="keepsake-stage">
        <div className="keepsake-scroll keepsake-scroll--status">
          <StatusPanel
            state={failed ? 'error' : 'loading'}
            label={
              failed
                ? t('What the party knows could not be read. Try again.')
                : t('Gathering what we know…')
            }
            onRetry={retry}
          />
        </div>
      </div>
    );
  }
  const { book: known, factsMissing, partial } = read;
  const named = [...known.people, ...known.places, ...known.things];
  const found = matching(named, typed).length;
  const searching = typed.trim() !== '';
  return (
    <div className="keepsake-stage" hidden={!shown}>
      <div
        className="keepsake-scroll known-page"
        role="region"
        aria-label={t('What the party knows')}
        tabIndex={0}
      >
        <header className="known-head">
          <h2>{t('What we know')}</h2>
          <p>
            {t(
              'Who and what the party knows of — people, places and things — as the party knows them.',
            )}
          </p>
          {/* A part that could not be read is left out, and the page says so. */}
          <p role="status" className="known-partial">
            {partial && (
              <>
                {t('Part of this page could not be read.')}{' '}
                <button type="button" onClick={retry}>
                  {t('Try again')}
                </button>
              </>
            )}
          </p>
          {named.length > 0 && (
            <div className="known-find">
              <label htmlFor={`${ids}-find`}>{t('Find a name')}</label>
              <input
                id={`${ids}-find`}
                type="search"
                value={typed}
                maxLength={60}
                autoComplete="off"
                onChange={(event) => {
                  setTyped(event.target.value);
                }}
              />
              <p role="status">
                {searching
                  ? found === 0
                    ? t('No name like that is known to the party.')
                    : t('Names found: {count}', { count: found })
                  : ''}
              </p>
            </div>
          )}
        </header>
        {known.empty && (
          <p className="known-none">
            {t('Nothing yet: the page fills as the party meets people and learns things.')}
          </p>
        )}
        <Section
          api={party}
          glyph="member"
          title={t('People and creatures')}
          entries={known.people}
          typed={typed}
          factsMissing={factsMissing}
          onChapter={onChapter}
        />
        <Section
          api={party}
          glyph="map"
          title={t('Places')}
          entries={known.places}
          typed={typed}
          factsMissing={factsMissing}
          onChapter={onChapter}
        />
        <Section
          api={party}
          glyph="key"
          title={t('Things and factions')}
          entries={known.things}
          typed={typed}
          factsMissing={factsMissing}
          onChapter={onChapter}
        />
        {!searching && known.lore.length > 0 && (
          <section className="known-section" aria-labelledby={`${ids}-lore`}>
            <h3 id={`${ids}-lore`}>
              <Glyph name="fact" />
              {t('What else we have learned')}
            </h3>
            <ul className="known-facts">
              {known.lore.map((fact) => (
                <Fact key={fact.knowledgeId} fact={fact} />
              ))}
            </ul>
          </section>
        )}
        {!searching && known.quests.length > 0 && (
          <section className="known-section" aria-labelledby={`${ids}-quests`}>
            <h3 id={`${ids}-quests`}>
              <Glyph name="journal" />
              {t('What we set out to do')}
            </h3>
            <ul className="known-quests">
              {known.quests.map((quest) => (
                <li key={quest.questId}>
                  <strong>{quest.title}</strong>
                  <span className="known-type">
                    {quest.done ? t('Completed') : t('In progress')}
                  </span>
                  {quest.latest !== null && <p>{quest.latest}</p>}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
