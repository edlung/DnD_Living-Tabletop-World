import type {
  BookPlace,
  EntityRef,
  OpenedBook,
  PreparedEncounterListResponse,
} from '@ltw/contracts';
import { useT } from '@ltw/ui';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { WorldApi } from '../api/client.ts';
import { useResource } from '../api/resource.ts';
import { Ribbon } from '../book-kit/kit.tsx';
import { Sheet } from '../shell/sheet.tsx';
import type { Shell } from '../shell/use-shell.ts';
import { Glyph } from '../visual/glyph.tsx';
import { BookMarks } from './bookmarks.tsx';
import { useCard } from './cards.tsx';
import {
  leafAt,
  leavesOf,
  placeAfterTurn,
  placeWithChapter,
  placeWithNote,
  placeWithRibbon,
  platesFor,
  type Leaf,
} from './model.ts';
import { encounterOf, momentId, momentsOf, type Moment } from './moments.ts';
import { PageText, type Passage } from './page-text.tsx';
import { CastToScreen } from './actions.tsx';
import { ChapterPath } from './path.tsx';
import { PlateFigure } from './plate.tsx';
import { Brief, MomentCard } from './side.tsx';
import type { DmBook } from './use-book.ts';

/**
 * The DM's book (docs/adr/0074-dm-book.md §3): the campaign's story as a spread — the text on the
 * left page, the picture and "how we play this" on the right — with bookmarks to the sections the
 * dock holds and the path through the chapters. It reads; it changes nothing in the world. The
 * DM's place in it (the ribbon, played chapters, notes) is the DM's own, kept beside the world.
 */
const SIZE_KEY = 'ltw.book-size';
const rememberedSize = (): 'normal' | 'large' => {
  try {
    return window.localStorage.getItem(SIZE_KEY) === 'large' ? 'large' : 'normal';
  } catch {
    return 'normal';
  }
};

export function BookSheet({
  api,
  shell,
  book,
  directory,
  onPlace,
}: {
  readonly api: WorldApi;
  readonly shell: Shell;
  readonly book: DmBook;
  readonly directory: readonly EntityRef[];
  /** Opens a place of the story in the Scene, its card on the spread's right page. */
  readonly onPlace: (entityId: string) => void;
}) {
  const t = useT();
  const open = shell.sheet === 'book';
  const { reread } = book;
  // Opening the book asks for it again: the clues the table found since may open a chapter.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open && !wasOpen.current) reread();
    wasOpen.current = open;
  }, [open, reread]);
  if (!book.opened)
    return (
      <Sheet id="book" title={t('Book')} glyph="perform" open={open} onClose={shell.closeSheet}>
        <p className="muted-line">{t('This campaign has no book to read here.')}</p>
      </Sheet>
    );
  return (
    <OpenBook
      api={api}
      shell={shell}
      book={book}
      opened={book.opened}
      directory={directory}
      open={open}
      onPlace={onPlace}
    />
  );
}

function OpenBook({
  api,
  shell,
  book,
  opened,
  directory,
  open,
  onPlace,
}: {
  readonly api: WorldApi;
  readonly shell: Shell;
  readonly book: DmBook;
  readonly onPlace: (entityId: string) => void;
  readonly opened: OpenedBook;
  readonly directory: readonly EntityRef[];
  readonly open: boolean;
}) {
  const t = useT();
  const { place, setPlace } = book;
  const load = useCallback(
    (signal: AbortSignal) =>
      api.get<PreparedEncounterListResponse>('encounters/prepared', signal, false),
    [api],
  );
  const prepared = useResource('book-prepared-encounters', load);
  const encounters = prepared.resource.status === 'ready' ? prepared.resource.value.encounters : [];

  const [reading, setReading] = useState<string | null>(null);
  const [screen, setScreen] = useState(0);
  const [screens, setScreens] = useState(1);
  const [moment, setMoment] = useState<Moment | null>(null);
  const [view, setView] = useState<'spread' | 'path'>('spread');
  const [size, setSize] = useState(rememberedSize);
  const [said, setSaid] = useState('');
  // The place before the last turn moved the ribbon: the turn can be taken back.
  const [undo, setUndo] = useState<BookPlace | null>(null);
  const title = useRef<HTMLHeadingElement>(null);
  // Asked to focus the page's title after it is drawn (a chapter opened, the ribbon moved by hand).
  const [toTitle, setToTitle] = useState(0);
  const opener = useRef<HTMLElement | null>(null);
  const side = useRef<HTMLDivElement>(null);

  const content = opened.content;
  const leaves = leavesOf(content);
  const leaf = leafAt(leaves, reading ?? place.ribbon);
  const encounterBy = (key: string) => encounterOf(encounters, opened.ids.encounters[key]);
  const heroes = directory.filter((entity) => entity.kind === 'character');
  const card = useCard(content, moment, leaf?.chapter.key ?? '', encounterBy, {
    api,
    heroes,
    // The fight is the product's own screen: the book steps aside for the battlefield.
    onFightStarted: shell.dismissSheet,
  });
  const wasCard = useRef(false);
  useEffect(() => {
    const heading = side.current?.querySelector<HTMLElement>('h3');
    if (moment !== null) {
      heading?.focus({ preventScroll: true });
      // Stacked pages: the card may be under the fold.
      heading?.scrollIntoView({ block: 'nearest' });
    } else if (wasCard.current) {
      // Back to the words the card was opened from; the brief's heading when they are gone.
      if (opener.current?.isConnected) opener.current.focus({ preventScroll: true });
      else heading?.focus({ preventScroll: true });
    }
    wasCard.current = moment !== null;
  }, [moment]);
  useEffect(() => {
    if (toTitle > 0) title.current?.focus({ preventScroll: true });
  }, [toTitle]);

  if (!leaf) return null;
  const nameOf = (key: string) =>
    directory.find((entity) => entity.entityId === opened.ids.entities[key])?.name ??
    content.people.find((person) => person.key === key)?.name ??
    key;
  const ribbon = leafAt(leaves, place.ribbon);
  const atRibbon = ribbon?.key === leaf.key;
  const shownScreen = Math.min(screen, screens - 1);
  const go = (to: Leaf, at: 'start' | 'end') => {
    setReading(to.key);
    setScreen(at === 'start' ? 0 : Number.MAX_SAFE_INTEGER);
    setMoment(null);
    setUndo(null);
    setSaid(
      to.page
        ? t('Page: {title}', { title: to.page.title })
        : t('Chapter {number}: {title}', { number: to.chapter.number, title: to.chapter.title }),
    );
  };
  const next = leaves[leaf.index + 1];
  const previous = leaves[leaf.index - 1];
  const turnOn = () => {
    if (shownScreen < screens - 1) {
      setScreen(shownScreen + 1);
      setSaid(t('Part {number} of {parts}', { number: shownScreen + 2, parts: screens }));
      return;
    }
    if (!next) return;
    const after = placeAfterTurn(place, leaves, leaf, next);
    go(next, 'start');
    if (after !== place) {
      setPlace(() => after);
      setUndo(place);
    }
  };
  const turnBack = () => {
    if (shownScreen > 0) {
      setScreen(shownScreen - 1);
      setSaid(t('Part {number} of {parts}', { number: shownScreen, parts: screens }));
    } else if (previous) go(previous, 'end');
  };
  const openMoment = (target: Moment, from: HTMLElement) => {
    opener.current = from;
    setMoment(target);
    setSaid(t('Opened on the right page'));
  };
  const closeMoment = () => {
    setMoment(null);
  };
  const passages: Passage[] = leaf.page
    ? [{ aloud: leaf.page.voice === 'players', text: leaf.page.text }]
    : [{ aloud: true, text: leaf.chapter.readAloud }];
  const lines = momentsOf(content, leaf, (key) => encounterBy(key)?.title ?? t('Fight'));
  const trail = `${t('Chapter {number}', { number: leaf.chapter.number })} · ${leaf.chapter.title}`;
  const pages = leaf.chapter.pages.length;
  const pageNumber = leaf.page ? leaf.chapter.pages.indexOf(leaf.page) + 1 : 0;
  return (
    <Sheet id="book" title={content.title} glyph="perform" open={open} onClose={shell.closeSheet}>
      <div className="dmb" data-size={size} data-view={view}>
        <BookMarks
          view={view}
          onView={(to) => {
            setView(to);
            if (to === 'path') setMoment(null);
          }}
        />
        <p className="visually-hidden" role="status">
          {said}
        </p>
        {book.unsaved && (
          <p className="dmb-unsaved" role="alert">
            {t('Your place in the book is not saved yet — it will be with the next change.')}
          </p>
        )}
        {view === 'path' ? (
          <ChapterPath
            book={content}
            place={place}
            found={new Set(opened.found)}
            placeName={nameOf}
            onRead={(to) => {
              go(to, 'start');
              setView('spread');
              setToTitle((value) => value + 1);
            }}
            onRibbon={(to) => {
              setPlace((current) => placeWithRibbon(current, to));
            }}
            onPlayed={(chapter, played) => {
              setPlace((current) => placeWithChapter(current, chapter, played));
            }}
            onMap={() => {
              shell.openSheetFromBook('places');
            }}
          />
        ) : (
          <div className="dmb-spread" data-surface="paper">
            <article className="dmb-page dmb-left" aria-label={t('The story')}>
              <p className="dmb-eyebrow">
                <span>{trail}</span>
                <PlaceLink
                  name={nameOf(leaf.page?.place ?? leaf.chapter.place)}
                  entityId={opened.ids.entities[leaf.page?.place ?? leaf.chapter.place]}
                  onPlace={onPlace}
                />
              </p>
              <div className="dmb-head">
                <h3 ref={title} className="dmb-title" tabIndex={-1}>
                  {leaf.page ? leaf.page.title : leaf.chapter.title}
                </h3>
                <button
                  type="button"
                  className="dmb-button dmb-size"
                  aria-pressed={size === 'large'}
                  aria-label={t('Larger text')}
                  title={t('Larger text')}
                  onClick={() => {
                    const to = size === 'large' ? 'normal' : 'large';
                    setSize(to);
                    try {
                      window.localStorage.setItem(SIZE_KEY, to);
                    } catch {
                      // A browser that refuses storage simply forgets the size.
                    }
                  }}
                >
                  {t('Aa')}
                </button>
              </div>
              <p className="dmb-voice">
                {leaf.page === null
                  ? t('Read aloud')
                  : leaf.page.voice === 'players'
                    ? t('Can be read aloud')
                    : t('For the DM: tell it in your own words')}
                {leaf.page?.aftermath === true && ` · ${t('The DM’s notes after the scene')}`}
                {content.assembled === true && ` · ${t('Assembled from the campaign itself')}`}
              </p>
              <PageText
                key={leaf.key}
                passages={passages}
                page={leaf.page}
                screen={shownScreen}
                onScreens={setScreens}
                openKey={moment && 'key' in moment ? moment.key : null}
                onOpen={(opens, from) => {
                  openMoment({ kind: opens.kind, key: opens.key }, from);
                }}
              />
              <p className="dmb-ribbon">
                {atRibbon ? (
                  <>
                    <span className="dmb-ribbon-here">
                      <Ribbon label={t('Ribbon')} />
                      {undo ? t('The ribbon moved here') : t('The party is here')}
                    </span>
                    {undo && (
                      <button
                        type="button"
                        className="dmb-button"
                        onClick={() => {
                          setPlace(() => undo);
                          setUndo(null);
                          setToTitle((value) => value + 1);
                        }}
                      >
                        {t('Take the ribbon back')}
                      </button>
                    )}
                  </>
                ) : (
                  <>
                    <span>
                      {ribbon?.page
                        ? t('The ribbon: {title}', { title: ribbon.page.title })
                        : t('The ribbon: chapter {number}', {
                            number: ribbon?.chapter.number ?? 1,
                          })}
                    </span>
                    <button
                      type="button"
                      className="dmb-button"
                      onClick={() => {
                        if (ribbon) go(ribbon, 'start');
                        setToTitle((value) => value + 1);
                      }}
                    >
                      {t('To the ribbon')}
                    </button>
                    <button
                      type="button"
                      className="dmb-button"
                      onClick={() => {
                        setPlace((current) => placeWithRibbon(current, leaf));
                        setToTitle((value) => value + 1);
                      }}
                    >
                      <Glyph name="bookmark" />
                      {t('Lay the ribbon here')}
                    </button>
                  </>
                )}
              </p>
              <div className="dmb-turn">
                <button
                  type="button"
                  className="dmb-button"
                  disabled={shownScreen === 0 && !previous}
                  aria-label={t('Turn back')}
                  onClick={turnBack}
                >
                  <Glyph name="chevron-left" />
                </button>
                <p className="dmb-turn-count">
                  {pageNumber === 0
                    ? t('The chapter opens · {pages} pages', { pages })
                    : t('Page {number} of {pages}', { number: pageNumber, pages })}
                  {screens > 1 &&
                    ` · ${t('part {number} of {parts}', { number: shownScreen + 1, parts: screens })}`}
                </p>
                {shownScreen >= screens - 1 && next?.chapter.key !== leaf.chapter.key && (
                  <button
                    type="button"
                    className="dmb-button"
                    onClick={() => {
                      setView('path');
                      setMoment(null);
                    }}
                  >
                    {t('The path')}
                  </button>
                )}
                <button
                  type="button"
                  className="dmb-button dmb-button--main"
                  disabled={shownScreen >= screens - 1 && !next}
                  onClick={turnOn}
                >
                  {shownScreen < screens - 1
                    ? t('Read on')
                    : next && next.chapter.key !== leaf.chapter.key
                      ? t('Next chapter')
                      : t('Next page')}
                  <Glyph name="chevron-right" />
                </button>
              </div>
            </article>
            <aside ref={side} className="dmb-page dmb-right" aria-label={t('The right page')}>
              <PlateFigure
                api={api}
                plates={platesFor(leaf, card?.subject ?? null)}
                entityOf={(key) => opened.ids.entities[key]}
                nameOf={nameOf}
                open={card !== null}
                under={(entityId) => (
                  <CastToScreen
                    api={api}
                    entityId={entityId}
                    words={leaf.page === null && card === null ? leaf.chapter.readAloud : null}
                  />
                )}
              />
              {card ? (
                <MomentCard
                  key={moment ? momentId(moment) : 'card'}
                  card={card}
                  onBack={closeMoment}
                />
              ) : (
                <Brief
                  book={content}
                  leaf={leaf}
                  lines={lines}
                  heroes={heroes}
                  note={place.notes[leaf.key] ?? ''}
                  onNote={(note) => {
                    setPlace((current) => placeWithNote(current, leaf.key, note));
                  }}
                  onOpen={openMoment}
                />
              )}
            </aside>
          </div>
        )}
      </div>
    </Sheet>
  );
}

/** Where a page plays: a press opens that place in the Scene (docs/adr/0075-book-interface.md §5). */
function PlaceLink({
  name,
  entityId,
  onPlace,
}: {
  readonly name: string;
  readonly entityId: string | undefined;
  readonly onPlace: (entityId: string) => void;
}) {
  const t = useT();
  if (entityId === undefined) return <span>{name}</span>;
  return (
    <button
      type="button"
      className="dmb-place"
      aria-label={t('Open {place} in the Scene', { place: name })}
      onClick={() => {
        onPlace(entityId);
      }}
    >
      {name}
    </button>
  );
}
