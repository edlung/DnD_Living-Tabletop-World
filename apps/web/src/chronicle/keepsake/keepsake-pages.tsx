import type { HandoutView, ReflectionView } from '@ltw/contracts';
import { useLanguage, useT } from '@ltw/ui';
import { useId } from 'react';

import type { WorldApi } from '../../api/client.ts';
import { readerLocale } from '../../ritual/next-game-words.ts';
import {
  dayWords,
  playedWords,
  shortDayWords,
  type BookEvening,
  type KeepsakeBook,
} from './book-model.ts';
import { BookFace, BookPlate, BookTile, useNear } from './book-pictures.tsx';

/**
 * The book of the campaign as a page (docs/adr/0072-keepsakes.md §1): the cover, the party's
 * chapters — each with its evening's day, its place, its prose exactly as written, the faces met
 * and the evening's stars — the gallery, and the ending. The same page on the screen, where it
 * scrolls and reads each chapter's pictures as it comes up, and on paper (`paper`), where every
 * picture is read before printing. `api` is the party's view; `top` the level of the book's title
 * where the page stands.
 */
export function KeepsakePages({
  api,
  name,
  book,
  top,
  paper = false,
}: {
  readonly api: WorldApi;
  readonly name: string;
  readonly book: KeepsakeBook;
  readonly top: 1 | 3;
  readonly paper?: boolean;
}) {
  const t = useT();
  const locale = readerLocale(useLanguage());
  const ids = useId();
  const Title = `h${String(top)}` as 'h1' | 'h3';
  const Part = `h${String(top + 1)}` as 'h2' | 'h4';
  const Group = `h${String(top + 2)}` as 'h3' | 'h5';
  const played = book.played === null ? null : playedWords(book.played, locale);
  const pictured = book.places.length + book.faces.length + book.handouts.length > 0;
  // The contents' way to a chapter: it comes to the top of the page and its title takes focus.
  const go = (id: string) => {
    const target = document.getElementById(id);
    (target?.closest('.keepsake-chapter') ?? target)?.scrollIntoView({ block: 'start' });
    const title = target?.matches('h2, h4')
      ? target
      : target?.nextElementSibling?.querySelector('h2, h4');
    if (title instanceof HTMLElement) title.focus({ preventScroll: true });
  };
  return (
    <article className="keepsake" aria-labelledby={`${ids}-title`}>
      <header className="keepsake-cover">
        <p className="keepsake-eyebrow">{t('The book of the campaign')}</p>
        <Title id={`${ids}-title`}>{name}</Title>
        {book.heroes.length > 0 && (
          <ul className="keepsake-faces keepsake-heroes" aria-label={t('The heroes')}>
            {book.heroes.map((hero) => (
              <BookFace key={hero.entityId} api={api} who={hero} at={null} wanted />
            ))}
          </ul>
        )}
        {played !== null && book.played !== null && (
          <p className="keepsake-played">
            {played.to === null
              ? t('Played on {day}', { day: played.from })
              : t('Played from {from} to {to}', { from: played.from, to: played.to })}
            {book.played.evenings > 1 &&
              ` · ${t('Evenings in the book: {count}', { count: book.played.evenings })}`}
          </p>
        )}
      </header>
      {book.evenings.length === 0 && (
        <p className="keepsake-empty">
          {t('The book is still empty. Its first chapter appears after the first evening of play.')}
        </p>
      )}
      {/* A long book's way around, on the screen: paper has no page to name. */}
      {!paper && book.evenings.length > 1 && (
        <nav className="keepsake-contents" aria-label={t('In this book')}>
          <ol>
            {book.evenings.map((evening, index) => (
              <li key={evening.chapter.chronicleId}>
                <button
                  type="button"
                  onClick={() => {
                    go(`${ids}-evening-${String(index)}`);
                  }}
                >
                  <span>{evening.chapter.title}</span>
                  {evening.playedOn !== null && (
                    <small>{shortDayWords(evening.playedOn, locale)}</small>
                  )}
                </button>
              </li>
            ))}
            {pictured && (
              <li>
                <button
                  type="button"
                  onClick={() => {
                    go(`${ids}-gallery`);
                  }}
                >
                  <span>{t('Gallery')}</span>
                </button>
              </li>
            )}
          </ol>
        </nav>
      )}
      {book.evenings.map((evening, index) => (
        <Evening
          key={evening.chapter.chronicleId}
          api={api}
          evening={evening}
          locale={locale}
          heading={Part}
          titleId={`${ids}-evening-${String(index)}`}
          paper={paper}
        />
      ))}
      <Gallery
        api={api}
        book={book}
        heading={Part}
        group={Group}
        markId={`${ids}-gallery`}
        paper={paper}
      />
      {book.evenings.length > 0 && (
        <p className="keepsake-ending">{t(book.finished ? 'The end' : 'To be continued…')}</p>
      )}
    </article>
  );
}

function Evening({
  api,
  evening,
  locale,
  heading: Heading,
  titleId,
  paper,
}: {
  readonly api: WorldApi;
  readonly evening: BookEvening;
  readonly locale: string;
  readonly heading: 'h2' | 'h4';
  /** The title's ID: the contents lead to it. */
  readonly titleId: string;
  readonly paper: boolean;
}) {
  const t = useT();
  const ids = useId();
  const [ref, near] = useNear<HTMLElement>(paper);
  const { chapter, place, people, stars, playedOn } = evening;
  return (
    <section ref={ref} className="keepsake-chapter" aria-labelledby={titleId}>
      <header className="keepsake-chapter-head">
        {playedOn !== null && <p className="keepsake-day">{dayWords(playedOn, locale)}</p>}
        <Heading id={titleId} tabIndex={-1}>
          {chapter.title}
        </Heading>
        {place !== null && <BookPlate api={api} place={place} at={chapter.to} wanted={near} />}
      </header>
      {chapter.prose.paragraphs.map((paragraph, index) => (
        <p key={index} className="keepsake-prose">
          {paragraph.text}
        </p>
      ))}
      {people.length > 0 && (
        <div className="keepsake-aside">
          <p className="keepsake-label" id={`${ids}-met`}>
            {t('Met that evening')}
          </p>
          <ul className="keepsake-faces" aria-labelledby={`${ids}-met`}>
            {people.map((who) => (
              <BookFace key={who.entityId} api={api} who={who} at={chapter.to} wanted={near} />
            ))}
          </ul>
        </div>
      )}
      {stars.length > 0 && (
        <div className="keepsake-aside">
          <p className="keepsake-label" id={`${ids}-stars`}>
            {t('What we loved that evening')}
          </p>
          <Stars entries={stars} labelledBy={`${ids}-stars`} />
        </div>
      )}
    </section>
  );
}

/** The evening's stars: whose words, then the words, as the whole table read them. */
function Stars({
  entries,
  labelledBy,
}: {
  readonly entries: readonly ReflectionView[];
  readonly labelledBy: string;
}) {
  const t = useT();
  return (
    <ul className="keepsake-stars" aria-labelledby={labelledBy}>
      {entries.map((entry) => (
        <li key={entry.author?.entityId ?? 'dm'}>
          <strong>
            {entry.author === null ? t('The DM') : (entry.author.name ?? t('Someone at the table'))}
          </strong>
          <span>{entry.star}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * The gallery: the places and the faces of the chapters, each as the party last saw it there, and
 * what the DM showed the whole party. A group with no picture to show is not shown (the
 * stylesheet's `:has`), and so is the gallery with no group.
 */
function Gallery({
  api,
  book,
  heading: Heading,
  group: Group,
  markId,
  paper,
}: {
  readonly api: WorldApi;
  readonly book: KeepsakeBook;
  readonly heading: 'h2' | 'h4';
  readonly group: 'h3' | 'h5';
  /** The ID of the gallery's place on the page: the contents lead to it. */
  readonly markId: string;
  readonly paper: boolean;
}) {
  // The mark stands where the gallery will: the gallery itself is not laid out until it has a
  // picture, and what is not laid out never comes near.
  const [mark, near] = useNear<HTMLSpanElement>(paper);
  if (book.places.length + book.faces.length + book.handouts.length === 0) return null;
  return (
    <>
      <span ref={mark} id={markId} className="keepsake-mark" aria-hidden="true" />
      <GalleryGroups api={api} book={book} heading={Heading} group={Group} near={near} />
    </>
  );
}

function GalleryGroups({
  api,
  book,
  heading: Heading,
  group: Group,
  near,
}: {
  readonly api: WorldApi;
  readonly book: KeepsakeBook;
  readonly heading: 'h2' | 'h4';
  readonly group: 'h3' | 'h5';
  readonly near: boolean;
}) {
  const t = useT();
  const ids = useId();
  return (
    <section className="keepsake-gallery" aria-labelledby={`${ids}-title`}>
      <Heading id={`${ids}-title`} tabIndex={-1}>
        {t('Gallery')}
      </Heading>
      <div className="keepsake-group">
        <Group>{t('Places')}</Group>
        <div className="keepsake-tiles">
          {book.places.map((one) => (
            <BookTile
              key={one.entity.entityId}
              api={api}
              entity={one.entity}
              at={one.at}
              wanted={near}
            />
          ))}
        </div>
      </div>
      <div className="keepsake-group">
        <Group>{t('Faces')}</Group>
        <div className="keepsake-tiles keepsake-tiles--faces">
          {book.faces.map((one) => (
            <BookTile
              key={one.entity.entityId}
              api={api}
              entity={one.entity}
              at={one.at}
              wanted={near}
            />
          ))}
        </div>
      </div>
      {book.handouts.length > 0 && (
        <div className="keepsake-group keepsake-group--shown">
          <Group>{t('Shown to the party')}</Group>
          <ul className="keepsake-handouts">
            {book.handouts.map((handout) => (
              <Handout key={handout.handoutId} api={api} handout={handout} wanted={near} />
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function Handout({
  api,
  handout,
  wanted,
}: {
  readonly api: WorldApi;
  readonly handout: HandoutView;
  readonly wanted: boolean;
}) {
  return (
    <li className="keepsake-handout">
      <strong>{handout.title}</strong>
      {handout.picture !== null && (
        <BookTile
          api={api}
          entity={handout.picture}
          at={null}
          wanted={wanted}
          caption={null}
          alt={handout.picture.name ?? handout.title}
        />
      )}
      {handout.text !== null && <p>{handout.text}</p>}
    </li>
  );
}
