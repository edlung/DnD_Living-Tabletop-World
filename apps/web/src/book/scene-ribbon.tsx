import { useT } from '@ltw/ui';

import type { Shell } from '../shell/use-shell.ts';
import { leafAt, leavesOf } from './model.ts';
import type { DmBook } from './use-book.ts';

/**
 * The ribbon over the Scene (docs/adr/0075-book-interface.md §5): the DM's book is one book, so
 * the ribbon that marks where the party is in the story hangs at the spine of the Scene's spread
 * too, with its chapter's number. A press opens the story there. It shows only on the spread, and
 * says whether the chapter plays at the place in the Scene; reading never moves it (ADR 0074 §3.4).
 */
export function SceneRibbon({
  book,
  shell,
  placeId,
}: {
  readonly book: DmBook;
  readonly shell: Shell;
  /** The place the Scene shows; null while it loads. */
  readonly placeId: string | null;
}) {
  const t = useT();
  const opened = book.opened;
  if (!opened) return null;
  const leaf = leafAt(leavesOf(opened.content), book.place.ribbon);
  if (!leaf) return null;
  const { chapter } = leaf;
  const here = placeId !== null && opened.ids.entities[chapter.place] === placeId;
  const label = t('The ribbon is in chapter {number}, “{title}”: open the story there', {
    number: String(chapter.number),
    title: chapter.title,
  });
  return (
    <button
      type="button"
      className="scene-ribbon"
      data-here={here ? '' : undefined}
      aria-label={label}
      title={label}
      onClick={() => {
        shell.openSheet('book');
      }}
    >
      <span className="scene-ribbon-word" aria-hidden="true">
        {t('Ch.')}
      </span>
      <span className="scene-ribbon-number" aria-hidden="true">
        {chapter.number}
      </span>
    </button>
  );
}
