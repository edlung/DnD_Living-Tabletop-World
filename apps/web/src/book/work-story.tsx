import type { EntityKind, EntityRef, OpenedBook } from '@ltw/contracts';
import { useT } from '@ltw/ui';
import { useId, useState } from 'react';

import { Glyph } from '../visual/glyph.tsx';
import { leafAt, leavesOf, placeAfterTurn, placeWithRibbon, type Leaf } from './model.ts';
import { PageText, type Passage } from './page-text.tsx';
import type { DmBook } from './use-book.ts';
import { PageBrief } from './work-brief.tsx';

/**
 * The left page of the DM's working spread (docs/adr/0075-book-interface.md §16): the story of
 * the page the party is at — the words read aloud, then the DM's own text — where the Scene's
 * list stood. It always shows the leaf the ribbon lies on: turning it on or back moves the ribbon
 * (reading ahead is the Book's, which leaves the ribbon alone). "How we play this" folds at the
 * page's foot, its state remembered for this browser. A page the campaign wrote no words for says
 * so and lays out what the book holds of it (`work-brief.tsx`).
 */
const NOTES_KEY = 'ltw.work-notes';
const SIZE_KEY = 'ltw.book-size';
const remembered = (key: string): string | null => {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
};

export function WorkStory({
  book,
  opened,
  directory,
  placeId,
  covered,
  onEvening,
  onBook,
  onEntity,
}: {
  readonly book: DmBook;
  readonly opened: OpenedBook;
  readonly directory: readonly EntityRef[];
  /** The place the Scene shows. */
  readonly placeId: string;
  /** Another page lies over the Scene: the story under it is inert. */
  readonly covered: boolean;
  /** Between sessions: opens the Session's page, where the evening begins. Null while one plays. */
  readonly onEvening: (() => void) | null;
  /** Opens the Book at the ribbon: its contents, its cards, reading ahead. */
  readonly onBook: () => void;
  /** Opens someone of the story in the Scene: their card on the right page. */
  readonly onEntity: (entityId: string, kind: EntityKind) => void;
}) {
  const t = useT();
  const titleId = useId();
  const { place, setPlace } = book;
  const leaves = leavesOf(opened.content);
  const leaf = leafAt(leaves, place.ribbon);
  // The screen of the leaf shown; a leaf reached by turning back opens at its last screen.
  const [at, setAt] = useState<{ readonly leaf: string; readonly screen: number }>({
    leaf: '',
    screen: 0,
  });
  const [screens, setScreens] = useState(1);
  // Folded at first where the page is short (a tablet held wide): the words read aloud come first.
  const [notes, setNotes] = useState(
    () => (remembered(NOTES_KEY) ?? (window.innerHeight < 820 ? 'closed' : 'open')) === 'open',
  );
  if (!leaf) return null;
  const { chapter, page } = leaf;
  const passages: Passage[] = page
    ? [
        ...(page.readAloud === undefined ? [] : [{ aloud: true, text: page.readAloud }]),
        { aloud: page.voice === 'players', text: page.text },
      ]
    : [{ aloud: true, text: chapter.readAloud }];
  // The campaign wrote nothing for this page (a book assembled from a world whose place has no
  // description): one screen, and the brief in the story's place.
  const wordless = passages.every((passage) => passage.text.trim() === '');
  const parts = wordless ? 1 : screens;
  const shown = Math.min(at.leaf === leaf.key ? at.screen : 0, parts - 1);
  const next = leaves[leaf.index + 1];
  const previous = leaves[leaf.index - 1];
  const turnOn = () => {
    if (shown < parts - 1) setAt({ leaf: leaf.key, screen: shown + 1 });
    else if (next) {
      setPlace((current) => placeAfterTurn(current, leaves, leaf, next));
      setAt({ leaf: next.key, screen: 0 });
    }
  };
  const turnBack = () => {
    if (shown > 0) setAt({ leaf: leaf.key, screen: shown - 1 });
    else if (previous) {
      setPlace((current) => placeWithRibbon(current, previous));
      setAt({ leaf: previous.key, screen: Number.MAX_SAFE_INTEGER });
    }
  };
  // An assembled book's chapters are the campaign's own places and situations: when the Scene
  // shows another place than the page's, the page offers the leaf told there. The DM turns to it;
  // nothing moves by itself, and a written story keeps its own order.
  const toldAt = (one: Leaf) => opened.ids.entities[one.page?.place ?? one.chapter.place];
  const there =
    opened.content.assembled === true && toldAt(leaf) !== placeId
      ? (leaves.slice(leaf.index + 1).find((one) => toldAt(one) === placeId) ??
        leaves.slice(0, leaf.index).find((one) => toldAt(one) === placeId))
      : undefined;
  const openPerson = (key: string) => {
    const entity = directory.find((one) => one.entityId === opened.ids.entities[key]);
    if (entity) onEntity(entity.entityId, entity.kind);
    else onBook();
  };
  const pages = chapter.pages.length;
  const pageNumber = page ? chapter.pages.indexOf(page) + 1 : 0;
  const hints: (readonly [string, string])[] = page
    ? [
        ...(page.note === undefined ? [] : [['', page.note] as const]),
        ...(page.question === undefined ? [] : [[t('Ask the table'), page.question] as const]),
        ...(page.failForward === '' ? [] : [[t('If it fails'), page.failForward] as const]),
        ...(page.choices.length === 0
          ? []
          : [[t('What the players may choose'), page.choices.join(' · ')] as const]),
      ]
    : [
        ...(chapter.goal === '' ? [] : [[t('What the chapter is for'), chapter.goal] as const]),
        ...(chapter.dmNote === ''
          ? []
          : [[t('The campaign’s note for the DM'), chapter.dmNote] as const]),
      ];
  return (
    <section
      className="work-story dmb"
      aria-label={t('The story where the party is')}
      inert={covered}
      data-surface="paper"
      data-size={remembered(SIZE_KEY) === 'large' ? 'large' : 'normal'}
    >
      <div className="dmb-page dmb-left">
        {/* The evening begins from the page the DM is at, not from a list of settings (§18). */}
        {onEvening && (
          <div className="work-elsewhere work-evening" role="note">
            <p>{t('The evening has not begun.')}</p>
            <button type="button" className="dmb-button" onClick={onEvening}>
              {t('Begin the evening')}
            </button>
          </div>
        )}
        {there && (
          <div className="work-elsewhere" role="note">
            <p>
              {t(
                'The Scene shows another place. The book tells it in chapter {number}, “{title}”.',
                {
                  number: there.chapter.number,
                  title: there.page ? there.page.title : there.chapter.title,
                },
              )}
            </p>
            <button
              type="button"
              className="dmb-button"
              onClick={() => {
                setPlace((current) => placeWithRibbon(current, there));
                setAt({ leaf: there.key, screen: 0 });
              }}
            >
              {t('Open that chapter')}
            </button>
          </div>
        )}
        <p className="dmb-eyebrow">
          {t('Chapter {number}', { number: chapter.number })} · {chapter.title}
        </p>
        <div className="dmb-head">
          <h2 className="dmb-title" id={titleId}>
            {page ? page.title : chapter.title}
          </h2>
          <button type="button" className="dmb-button work-to-book" onClick={onBook}>
            <Glyph name="perform" />
            {t('In the book')}
          </button>
        </div>
        <p className="dmb-voice">
          {wordless
            ? t('The campaign wrote no text for this page: tell it in your own words.')
            : page === null
              ? t('Read aloud')
              : page.voice === 'players'
                ? t('Can be read aloud')
                : page.readAloud === undefined
                  ? t('For the DM: tell it in your own words')
                  : t('Read the quotation aloud; the rest is for the DM')}
        </p>
        {wordless ? (
          <PageBrief book={opened.content} leaf={leaf} hints={hints} labelledBy={titleId} />
        ) : (
          <PageText
            key={leaf.key}
            passages={passages}
            page={page}
            screen={shown}
            onScreens={setScreens}
            openKey={null}
            onOpen={(opens) => {
              if (opens.kind === 'person') openPerson(opens.key);
              else onBook();
            }}
          />
        )}
        {!wordless && hints.length > 0 && (
          <details
            className="work-notes"
            open={notes}
            onToggle={(event) => {
              const now = event.currentTarget.open;
              setNotes(now);
              try {
                window.localStorage.setItem(NOTES_KEY, now ? 'open' : 'closed');
              } catch {
                // A browser that refuses storage simply forgets the choice.
              }
            }}
          >
            <summary>{t('How we play this')}</summary>
            <dl>
              {hints.map(([label, words]) => (
                <div key={`${label}:${words.slice(0, 24)}`}>
                  {label !== '' && <dt>{label}</dt>}
                  <dd>{words}</dd>
                </div>
              ))}
            </dl>
          </details>
        )}
        <div className="dmb-turn">
          <button
            type="button"
            className="dmb-button"
            disabled={shown === 0 && !previous}
            aria-label={t('Turn back')}
            onClick={turnBack}
          >
            <Glyph name="chevron-left" />
          </button>
          <p className="dmb-turn-count">
            {pageNumber === 0
              ? t('The chapter opens · {pages} pages', { pages })
              : t('Page {number} of {pages}', { number: pageNumber, pages })}
            {parts > 1 && ` · ${t('part {number} of {parts}', { number: shown + 1, parts })}`}
          </p>
          <button
            type="button"
            className="dmb-button dmb-button--main"
            disabled={shown >= parts - 1 && !next}
            onClick={turnOn}
          >
            {shown < parts - 1
              ? t('Read on')
              : next && next.chapter.key !== chapter.key
                ? t('Next chapter')
                : t('Next page')}
            <Glyph name="chevron-right" />
          </button>
        </div>
      </div>
    </section>
  );
}
