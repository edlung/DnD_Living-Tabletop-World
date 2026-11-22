import type { BookPlace, CampaignBook } from '@ltw/contracts';
import { useT } from '@ltw/ui';
import { useId } from 'react';

import { Glyph } from '../visual/glyph.tsx';
import { leavesOf, pathOf, type ChapterOnPath, type Leaf } from './model.ts';

/**
 * The path through the chapters (docs/adr/0074-dm-book.md §3.5): which are played, where the
 * party is, what is next by the book, what a found clue has opened, and what waits. A state is a
 * hint, never a lock: every chapter opens, and the ribbon is laid where the DM says.
 */
export function ChapterPath({
  book,
  place,
  found,
  placeName,
  onRead,
  onRibbon,
  onPlayed,
  onMap,
}: {
  readonly book: CampaignBook;
  readonly place: BookPlace;
  readonly found: ReadonlySet<string>;
  readonly placeName: (key: string) => string;
  /** Opens a chapter to read; the ribbon stays. */
  readonly onRead: (leaf: Leaf) => void;
  /** Lays the ribbon at a chapter's opening. */
  readonly onRibbon: (leaf: Leaf) => void;
  readonly onPlayed: (chapter: string, played: boolean) => void;
  readonly onMap: () => void;
}) {
  const t = useT();
  const titleId = useId();
  const leaves = leavesOf(book);
  const first = (stop: ChapterOnPath) =>
    leaves.find((leaf) => leaf.chapter.key === stop.chapter.key);
  const said = (stop: ChapterOnPath) => {
    if (stop.state === 'here') return [t('The party is here'), ''];
    if (stop.state === 'played') return [t('Played'), ''];
    if (stop.state === 'next') return [t('Next by the book'), ''];
    if (stop.state === 'open')
      return [
        t('Open now'),
        t('a found clue leads here: {clues}', { clues: stop.clues.join(', ') }),
      ];
    return ['', ''];
  };
  return (
    <section className="dmb-path" aria-labelledby={titleId}>
      <div className="dmb-path-head">
        <h3 id={titleId} tabIndex={-1}>
          {t('Contents')}
        </h3>
        <button type="button" className="dmb-button" onClick={onMap}>
          <Glyph name="map" />
          {t('Open the map of places')}
        </button>
      </div>
      {book.order !== undefined && <p className="dmb-path-order">{book.order}</p>}
      <p className="dmb-path-order">
        {t(
          'Any chapter can be opened. The ribbon moves only when you turn the page or lay it yourself.',
        )}
      </p>
      <ol className="dmb-path-list">
        {pathOf(book, place, found).map((stop) => {
          const leaf = first(stop);
          const [state, why] = said(stop);
          return (
            <li key={stop.chapter.key} className="dmb-stop" data-state={stop.state}>
              <span className="dmb-stop-number" aria-hidden="true">
                {stop.chapter.number}
              </span>
              <h4 className="dmb-stop-title">
                <span className="visually-hidden">
                  {t('Chapter {number}', { number: stop.chapter.number })}.{' '}
                </span>
                {stop.chapter.title}
              </h4>
              <p className="dmb-stop-where">{placeName(stop.chapter.place)}</p>
              {state !== '' && (
                <p className="dmb-stop-state">
                  <strong>{state}</strong>
                  {why !== '' && ` — ${why}`}
                </p>
              )}
              {leaf && (
                <div className="dmb-stop-actions">
                  <button
                    type="button"
                    className="dmb-button dmb-button--main"
                    aria-label={t('Read chapter {number}: {title}', {
                      number: stop.chapter.number,
                      title: stop.chapter.title,
                    })}
                    onClick={() => {
                      onRead(leaf);
                    }}
                  >
                    {t('Read the chapter')}
                  </button>
                  {stop.state !== 'here' && (
                    <button
                      type="button"
                      className="dmb-button"
                      aria-label={t('Lay the ribbon at chapter {number}', {
                        number: stop.chapter.number,
                      })}
                      onClick={() => {
                        onRibbon(leaf);
                      }}
                    >
                      <Glyph name="bookmark" />
                      {t('Lay the ribbon here')}
                    </button>
                  )}
                  {stop.state !== 'here' && (
                    <button
                      type="button"
                      className="dmb-button"
                      aria-label={
                        stop.state === 'played'
                          ? t('Chapter {number} is not played yet', { number: stop.chapter.number })
                          : t('Chapter {number} is played', { number: stop.chapter.number })
                      }
                      onClick={() => {
                        onPlayed(stop.chapter.key, stop.state !== 'played');
                      }}
                    >
                      {stop.state === 'played' ? t('Not played yet') : t('Mark as played')}
                    </button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
